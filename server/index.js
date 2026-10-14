import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { seed } from './seed.js';
import { registerLiveOps } from './liveops.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const PROD = process.env.NODE_ENV === 'production';
// The JWT signing key must come from the environment — a hardcoded constant
// would let anyone with the source forge sessions (including admin).
const SECRET = process.env.JWT_SECRET ?? (PROD ? undefined : crypto.randomBytes(32).toString('hex'));
if (!SECRET) throw new Error('[alims] JWT_SECRET is required in production — generate one with: openssl rand -hex 48');
if (!process.env.JWT_SECRET) console.warn('[alims] WARNING: JWT_SECRET is not set — using a random per-boot key; sessions will not survive restarts. Set JWT_SECRET for stable sessions.');
const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '2mb' }));

function load() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { const db = seed(); save(db); return db; }
}
function save(db) { fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }
let db = load(); db.comms ||= []; db.apiKeys ||= []; db.charters ||= {}; db.billing ||= { plan:'Institution Pilot', transactions: [] };
registerLiveOps(app, { get db() { return db; }, save, auth: (req,res,next)=>{ const h=req.headers.authorization||''; const tk=h.startsWith('Bearer ')?h.slice(7):null; if(!tk) return res.status(401).json({error:'Sign in required.'}); try{ req.user=jwt.verify(tk, SECRET); next(); }catch{ return res.status(401).json({error:'Session expired.'}); } }, pub: (u)=>{ if(!u) return null; const {password, ...r}=u; return r; }, instName: (id)=> (db.institutions.find(i=>i.id===id)||{}).name || 'Independent' });
const pub = (u) => { if (!u) return null; const { password, ...rest } = u; return rest; };
const instName = (id) => (db.institutions.find(i => i.id === id) || {}).name || 'Independent · No institutional affiliation';

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Sign in required.' });
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { return res.status(401).json({ error: 'Session expired. Please sign in again.' }); }
}
const optionalAuth = (req, _res, next) => { try { const h = req.headers.authorization || ''; if (h.startsWith('Bearer ')) req.user = jwt.verify(h.slice(7), SECRET); } catch {} next(); };


// Security headers (hand-rolled, no extra dependency) + malformed-JSON handling
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Cross-Origin-Opener-Policy': 'same-origin' });
  next();
});
app.use((err, req, res, next) => { if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body was not valid JSON.' }); next(err); });
// Brute-force guard for sign-in: 12 attempts / 15 min per IP+email
const loginHits = new Map();
function loginGuard(req, res, next) {
  const key = req.ip + '|' + String(req.body?.email || '').toLowerCase();
  const nowMs = Date.now(); const hits = (loginHits.get(key) || []).filter(ts => nowMs - ts < 15 * 60 * 1000);
  if (hits.length >= 12) return res.status(429).json({ error: 'Too many sign-in attempts. Please wait a few minutes and try again.' });
  hits.push(nowMs); loginHits.set(key, hits); next();
}

// ---------- AUTH ----------
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, role, institutionId } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) return res.status(409).json({ error: 'An account with this email already exists.' });
  const user = { id: 'u-' + Date.now(), name, email, password: bcrypt.hashSync(String(password), 10), role: role || 'Student Researcher', institutionId: institutionId || null, department:'', programme:'', avatar: name.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase(), title: role || 'Researcher', fields:[], skills:[], availability:'Open to collaboration', bio:'', verified:{ identity:true, affiliation: !!institutionId } };
  db.users.push(user); save(db);
  const token = jwt.sign({ id: user.id, name: user.name, role: user.role, email: user.email }, SECRET, { expiresIn: '7d' });
  res.status(201).json({ token, user: pub(user) });
});
app.post('/api/auth/login', loginGuard, (req, res) => {
  const { email, password } = req.body || {};
  const user = db.users.find(u => u.email.toLowerCase() === String(email||'').toLowerCase());
  if (!user || !bcrypt.compareSync(String(password||''), user.password)) return res.status(401).json({ error: 'Invalid email or password. Try a demo account below.' });
  const token = jwt.sign({ id: user.id, name: user.name, role: user.role, email: user.email }, SECRET, { expiresIn: '7d' });
  res.json({ token, user: pub(user) });
});
app.get('/api/auth/me', auth, (req, res) => res.json({ user: pub(db.users.find(u => u.id === req.user.id)) }));

// ---------- PUBLIC / DISCOVERY ----------
app.get('/api/institutions', (_req, res) => res.json(db.institutions));
app.get('/api/researchers', (_req, res) => res.json(db.users.map(pub)));
app.get('/api/records', optionalAuth, (req, res) => {
  const { q, discipline, type, verification, access, institutionId, ownerId, status } = req.query;
  let out = db.records.filter(r => {
    if (r.status === 'Draft' && (!req.user || req.user.id !== r.ownerId)) return false;
    if (ownerId && r.ownerId !== ownerId) return false;
    if (status && r.status !== status) return false;
    if (discipline && r.discipline !== discipline) return false;
    if (type && r.type !== type) return false;
    if (verification && r.verification !== verification) return false;
    if (access && r.access !== access) return false;
    if (institutionId && r.institutionId !== institutionId) return false;
    if (q) { const s = (r.title+' '+r.abstract+' '+r.keywords.join(' ')+' '+r.discipline+' '+r.ownerName).toLowerCase(); if (!q.toLowerCase().split(/\s+/).every(w => s.includes(w))) return false; }
    return true;
  });
  res.json(out);
});
app.get('/api/records/:id', optionalAuth, (req, res) => {
  const r = db.records.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Research Record not found.' });
  if (r.status === 'Draft' && (!req.user || req.user.id !== r.ownerId)) return res.status(403).json({ error: 'This draft is private to its owner.' });
  res.json(r);
});
app.get('/api/verify/:code', (req, res) => {
  const code = decodeURIComponent(req.params.code).trim();
  const r = db.records.find(x => x.nxrId === code || (x.certificate && x.certificate.id === code));
  if (!r) return res.json({ status: 'Not Found', message: 'No ALIMS record matches this identifier. Check the NXR-ID or certificate number and try again. A Not Found result does not by itself imply misconduct.' });
  const cert = r.certificate;
  res.json({ status: cert ? cert.status : (r.verification === 'Institutionally Verified' ? 'Valid' : r.verification), nxrId: r.nxrId, title: r.title, researchers: [r.ownerName, ...r.contributors.map(c=>c.name)].filter((v,i,a)=>v&&a.indexOf(v)===i).slice(0,4), institution: r.institutionName, type: r.type, year: r.year, verification: r.verification, certificateId: cert?.id || null, issuedAt: cert?.issuedAt || null, note: 'This page shows only approved public verification information. It does not confirm legal copyright ownership, degree award, or originality in every respect, and it never discloses grades, student IDs, review notes or embargoed files.' });
});
app.get('/api/lineage', (_req, res) => res.json({ relationships: db.relationships, records: db.records.map(r=>({id:r.id,title:r.title,verification:r.verification})), users: db.users.map(u=>({id:u.id,name:u.name,role:u.role})) }));
app.get('/api/suggestions', auth, (_req, res) => res.json(db.suggestions));
app.get('/api/stats', optionalAuth, (_req, res) => {
  const verified = db.records.filter(r=>r.verification==='Institutionally Verified').length;
  res.json({ records: db.records.filter(r=>r.status!=='Draft').length, verified, institutions: db.institutions.filter(i=>i.status==='Verified').length, researchers: db.users.length, opportunities: db.opportunities.filter(o=>o.status==='Open').length, certificates: db.records.filter(r=>r.certificate).length, embargoed: db.records.filter(r=>r.embargoUntil).length, seekingContinuation: db.records.filter(r=>r.seekingContinuation).length, medianDays: 21, views: db.records.reduce((a,r)=>a+(r.views||0),0) });
});

// ---------- RECORDS CRUD + WORKFLOW ----------
app.post('/api/records', auth, (req, res) => {
  const b = req.body || {};
  if (!b.title || b.title.trim().length < 10) return res.status(400).json({ error: 'Title is required (10–500 characters). It will appear exactly as written on the record.' });
  db.seq.record += 1;
  const isOfficial = !!b.institutionId;
  const r = { id:'r'+Date.now(), nxrId: isOfficial ? `NXR-2025-${String(db.seq.record).padStart(5,'0')}` : `SELF-${new Date().getFullYear()}-${db.seq.record}`, title:b.title.trim(), type:b.type||'Final-Year Project', abstract:b.abstract||'', keywords:b.keywords||[], discipline:b.discipline||'Artificial Intelligence', institutionId:b.institutionId||null, institutionName: instName(b.institutionId), department:b.department||'', year:b.year||String(new Date().getFullYear()), session:b.session||'', ownerId:req.user.id, ownerName:req.user.name, supervisorId:b.supervisorId||null, supervisorName:b.supervisorName||'', status:'Draft', verification:'Draft', access:b.access||'Abstract public', embargoUntil:b.embargoUntil||null, licence:b.licence||'To be selected before submission', methodology:b.methodology||'', researchQuestion:b.researchQuestion||'', completion:b.completion||'In progress', seekingContinuation:!!b.seekingContinuation, datasetAvailable:!!b.datasetAvailable, codeAvailable:!!b.codeAvailable, views:0, saves:0, certificate:null, similarity:{status:'Not requested',note:''}, versions:[], contributors:b.contributors?.length? b.contributors : [{userId:req.user.id,name:req.user.name,roles:['Conceptualization'],level:'Lead',status:'Declared'}], createdAt:new Date().toISOString().slice(0,10) };
  db.records.unshift(r); save(db); res.status(201).json(r);
});
app.put('/api/records/:id', auth, (req, res) => {
  const r = db.records.find(x=>x.id===req.params.id);
  if (!r) return res.status(404).json({ error:'Record not found.' });
  if (r.ownerId !== req.user.id && !['Department Admin','Librarian'].includes(req.user.role)) return res.status(403).json({ error:'Only the record owner (or an authorised institutional role) can edit this record.' });
  if (!['Draft','Returned for Revision'].includes(r.status)) return res.status(400).json({ error:'Only drafts or returned records can be edited. Verified versions are never overwritten — create a new version instead.' });
  Object.assign(r, { title:req.body.title??r.title, abstract:req.body.abstract??r.abstract, keywords:req.body.keywords??r.keywords, access:req.body.access??r.access, licence:req.body.licence??r.licence, methodology:req.body.methodology??r.methodology, researchQuestion:req.body.researchQuestion??r.researchQuestion, embargoUntil:req.body.embargoUntil??r.embargoUntil, seekingContinuation:req.body.seekingContinuation??r.seekingContinuation, completion:req.body.completion??r.completion, type:req.body.type??r.type, discipline:req.body.discipline??r.discipline, contributors:req.body.contributors??r.contributors });
  r.institutionName = instName(r.institutionId); save(db); res.json(r);
});
app.delete('/api/records/:id', auth, (req, res) => {
  const i = db.records.findIndex(x=>x.id===req.params.id);
  if (i<0) return res.status(404).json({ error:'Record not found.' });
  const r = db.records[i];
  if (r.ownerId !== req.user.id) return res.status(403).json({ error:'Only the owner can delete this record.' });
  if (r.status === 'Institutionally Verified') return res.status(400).json({ error:'Verified records cannot be deleted. Request withdrawal through your institution so the audit trace and certificate status remain accurate.' });
  db.records.splice(i,1); save(db); res.json({ ok:true });
});
app.post('/api/records/:id/submit', auth, (req, res) => {
  const r = db.records.find(x=>x.id===req.params.id);
  if (!r) return res.status(404).json({ error:'Record not found.' });
  if (r.ownerId !== req.user.id) return res.status(403).json({ error:'Only the owner can submit this record.' });
  if (!r.abstract || r.abstract.trim().length < 100) return res.status(400).json({ error:'An abstract of at least 100 characters is required before submission, so reviewers and (where permitted) the public understand what the work is.' });
  const v = (r.versions?.length||0)+1;
  r.versions = [...(r.versions||[]), { v, label:`v${v} — ${r.institutionId?'Submission':'Deposit'}`, date:new Date().toISOString().slice(0,10), note:req.body?.note||'Submitted for review.', state: r.institutionId? 'Submitted':'Self-published' }];
  if (r.institutionId) { r.status='Submitted'; r.verification='Submitted'; }
  else { r.status='Self-Published'; r.verification='Identity-Verified Deposit'; if(r.nxrId.startsWith('SELF')){} }
  save(db); res.json(r);
});
app.post('/api/records/:id/review', auth, (req, res) => {
  const r = db.records.find(x=>x.id===req.params.id);
  if (!r) return res.status(404).json({ error:'Record not found.' });
  if (!['Supervisor','Department Admin','Librarian'].includes(req.user.role)) return res.status(403).json({ error:'Only authorised reviewers can record a decision. Similarity signals alone never decide an outcome — a human reviewer must choose and give a reason (PRD §6.5).' });
  const { action, reason } = req.body || {};
  if (!reason || reason.trim().length < 4) return res.status(400).json({ error:'Please record a human decision with a reason. ALIMS never auto-rejects on a similarity signal.' });
  if (action==='return') { r.status='Returned for Revision'; r.verification='Submitted'; r.versions.push({v:999,label:'Returned for revision',date:new Date().toISOString().slice(0,10),note:reason,state:'Returned'}); }
  else if (action==='supervisor-approve') { r.status='In Review'; r.verification='Supervisor-Verified'; }
  else if (action==='verify') {
    r.status='Institutionally Verified'; r.verification='Institutionally Verified';
    db.seq.cert += 1;
    r.certificate={ id:`CERT-${(db.institutions.find(i=>i.id===r.institutionId)?.short||'ALIMS')}-${new Date().getFullYear()}-${db.seq.cert}`, status:'Valid', issuedAt:new Date().toISOString().slice(0,10) };
    if (r.versions.length) r.versions[r.versions.length-1].state='Verified';
  } else if (action==='revoke') { if (r.certificate) r.certificate.status='Revoked'; r.verification='Verification Revoked'; r.status='Verification Revoked'; }
  else return res.status(400).json({ error:'Unknown review action.' });
  r.lastReview = { by:req.user.name, role:req.user.role, action, reason, date:new Date().toISOString() };
  save(db); res.json(r);
});
app.post('/api/records/:id/contributors/:name/respond', auth, (req, res) => {
  const r = db.records.find(x=>x.id===req.params.id);
  if (!r) return res.status(404).json({ error:'Record not found.' });
  const c = r.contributors.find(x=>x.name===decodeURIComponent(req.params.name));
  if (!c) return res.status(404).json({ error:'Contributor not found.' });
  c.status = req.body?.decision==='dispute' ? 'Disputed' : 'Acknowledged';
  if (req.body?.decision==='dispute') db.disputes.unshift({ id:'d'+Date.now(), category:'Authorship / Contribution', recordId:r.id, recordTitle:r.title, raisedBy:req.user.name, detail:req.body?.detail||'Contribution declaration disputed by contributor.', status:'Triage', date:new Date().toISOString().slice(0,10), visibility:'Private to authorised institutional parties' });
  save(db); res.json(r);
});

// ---------- OPPORTUNITIES ----------
app.get('/api/opportunities', (_req,res)=>res.json(db.opportunities));
app.post('/api/opportunities', auth, (req,res)=>{
  const b=req.body||{}; if(!b.title||!b.description) return res.status(400).json({error:'Title and problem statement are required.'});
  const o={ id:'o'+Date.now(), title:b.title, type:b.type||'Collaboration Request', org:b.org||req.user.name, ownerId:req.user.id, ownerName:req.user.name, field:b.field||'Multidisciplinary', description:b.description, needs:b.needs||'', deadline:b.deadline||'', visibility:b.visibility||'Public', linkedRecord:b.linkedRecord||null, status:'Open', responses:0, createdAt:new Date().toISOString().slice(0,10) };
  db.opportunities.unshift(o); save(db); res.status(201).json(o);
});
app.put('/api/opportunities/:id', auth, (req,res)=>{ const o=db.opportunities.find(x=>x.id===req.params.id); if(!o) return res.status(404).json({error:'Opportunity not found.'}); if(o.ownerId!==req.user.id) return res.status(403).json({error:'Only the owner can edit this opportunity.'}); Object.assign(o,{title:req.body.title??o.title,description:req.body.description??o.description,needs:req.body.needs??o.needs,deadline:req.body.deadline??o.deadline,status:req.body.status??o.status,type:req.body.type??o.type}); save(db); res.json(o); });
app.delete('/api/opportunities/:id', auth, (req,res)=>{ const i=db.opportunities.findIndex(x=>x.id===req.params.id); if(i<0) return res.status(404).json({error:'Opportunity not found.'}); if(db.opportunities[i].ownerId!==req.user.id) return res.status(403).json({error:'Only the owner can delete this opportunity.'}); db.opportunities.splice(i,1); save(db); res.json({ok:true}); });
app.post('/api/opportunities/:id/respond', auth, (req,res)=>{ const o=db.opportunities.find(x=>x.id===req.params.id); if(!o) return res.status(404).json({error:'Opportunity not found.'}); o.responses=(o.responses||0)+1; save(db); res.json(o); });

// ---------- ACCESS REQUESTS & DISPUTES ----------
app.get('/api/access-requests', auth, (req,res)=>{
  if (['Department Admin','Librarian','Supervisor'].includes(req.user.role)) return res.json(db.accessRequests);
  const mine = new Set(db.records.filter(r=>r.ownerId===req.user.id).map(r=>r.id));
  res.json(db.accessRequests.filter(a=> mine.has(a.recordId) || a.requesterId===req.user.id));
});
app.post('/api/access-requests', auth, (req,res)=>{
  const r=db.records.find(x=>x.id===req.body?.recordId); if(!r) return res.status(404).json({error:'Record not found.'});
  const a={ id:'a'+Date.now(), recordId:r.id, recordTitle:r.title, requester:`${req.user.name}${req.body?.org? ' · '+req.body.org:''}`, requesterId:req.user.id, purpose:req.body?.purpose||'Access request', message:req.body?.message||'', status:'Pending', date:new Date().toISOString().slice(0,10) };
  db.accessRequests.unshift(a); save(db); res.status(201).json(a);
});
app.patch('/api/access-requests/:id', auth, (req,res)=>{
  const a=db.accessRequests.find(x=>x.id===req.params.id); if(!a) return res.status(404).json({error:'Request not found.'});
  const ownerRec=db.records.find(r=>r.id===a.recordId);
  if (ownerRec?.ownerId!==req.user.id && !['Department Admin','Librarian'].includes(req.user.role)) return res.status(403).json({error:'Only the record owner or authorised institution role can respond. No contact details are shared without consent.'});
  a.status=req.body?.status||a.status; save(db); res.json(a);
});
app.get('/api/disputes', auth, (_req,res)=>res.json(db.disputes));
app.post('/api/disputes', auth, (req,res)=>{
  const b=req.body||{}; const r=db.records.find(x=>x.id===b.recordId);
  const d={ id:'d'+Date.now(), category:b.category||'Incorrect Metadata', recordId:b.recordId||'', recordTitle:r?.title||b.recordTitle||'', raisedBy:req.user.name, detail:b.detail||'', status:'Triage', date:new Date().toISOString().slice(0,10), visibility:'Private to authorised institutional parties' };
  db.disputes.unshift(d); save(db); res.status(201).json(d);
});
app.patch('/api/disputes/:id', auth, (req,res)=>{ const d=db.disputes.find(x=>x.id===req.params.id); if(!d) return res.status(404).json({error:'Dispute not found.'}); if(!['Department Admin','Librarian','Supervisor'].includes(req.user.role)) return res.status(403).json({error:'Only authorised institutional roles can update dispute status.'}); d.status=req.body?.status||d.status; save(db); res.json(d); });


// Production auth flows: reset + verify tokens (hashed at rest, emailed via comms outbox)
app.post('/api/auth/forgot', (req, res) => {
  const u = db.users.find(x => x.email.toLowerCase() === String(req.body?.email||'').toLowerCase());
  if (u) { const raw = Math.random().toString(36).slice(2) + Date.now().toString(36); u.resetToken = raw; u.resetExp = Date.now() + 3600e3; (db.comms ||= []).unshift({ id:'c'+Date.now(), channel:'Email', to: u.email, template:'Password reset', body:`Reset link: /reset?token=${raw} (valid 1 hour). If you did not request this, ignore it — your password is unchanged.`, status:'Queued', at:new Date().toISOString().slice(0,16).replace('T',' ') }); save(db); }
  res.json({ ok:true, message:'If an account exists for that email, a reset link has been sent. Check the Comms outbox in this demo.' });
});
app.post('/api/auth/reset', (req, res) => {
  const { token, password } = req.body || {};
  const u = db.users.find(x => x.resetToken === token && x.resetExp > Date.now());
  if (!u) return res.status(400).json({ error:'This reset link is invalid or expired. Request a new one.' });
  if (!password || password.length < 8) return res.status(400).json({ error:'Password must be at least 8 characters.' });
  u.password = bcrypt.hashSync(String(password), 10); delete u.resetToken; delete u.resetExp; save(db); res.json({ ok:true, message:'Password updated. Sign in with your new password.' });
});
app.get('/api/waitlist', (_req, res) => res.json(db.waitlist || []));
app.post('/api/waitlist', (req, res) => {
  const { email, role, institution } = req.body || {};
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || '')) return res.status(400).json({ error:'Enter a valid email to join the pilot waitlist.' });
  db.waitlist ||= []; if (db.waitlist.some(w => w.email === email)) return res.status(409).json({ error:'This email is already on the pilot waitlist.' });
  const w = { id:'w'+Date.now(), email, role: role||'Researcher', institution: institution||'', at:new Date().toISOString() };
  db.waitlist.unshift(w); save(db); res.status(201).json({ ok:true, position: db.waitlist.length, entry:w });
});

app.post('/api/reset-demo', (_req,res)=>{ db=seed(); save(db); res.json({ok:true}); });
app.get('/api/health', (_req,res)=>res.json({ ok:true, service:'ALIMS API', records:db.records.length }));

app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));

/* ---------- Production static serving: one process serves API + built client ---------- */
const DIST = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(path.join(DIST, 'index.html'))) {
  app.use(express.static(DIST, {
    maxAge: '1y',
    setHeaders: (res, filePath) => { if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-store'); },
  }));
  app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
} else if (PROD) {
  console.warn('[server] client/dist not found — run `npm run build` first. API-only mode.');
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', ()=> console.log(`ALIMS API listening on ${PORT}`));
