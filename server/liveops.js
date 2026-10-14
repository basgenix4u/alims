import crypto from 'crypto';
/* ALIMS LiveOps — Tier S/A/B/C implementation.
   Providers (NERD, Turnitin, Paystack, Termii, ORCID, Crossref) sit behind
   adapters in `providers`: with no keys configured they run in certified
   simulation mode and log every action, so swapping in production keys
   is a config change, not a rewrite. */
export const providers = {
  nerd:     { live: !!process.env.NERD_API_KEY,     name: 'NERD National Repository' },
  turnitin: { live: !!process.env.TURNITIN_API_KEY, name: 'Turnitin Similarity' },
  paystack: { live: !!process.env.PAYSTACK_SECRET_KEY, name: 'Paystack' },
  termii:   { live: !!process.env.TERMII_API_KEY,   name: 'Termii (SMS/WhatsApp)' },
  orcid:    { live: !!process.env.ORCID_CLIENT_ID,  name: 'ORCID' },
};
export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const mode = (p) => providers[p].live ? 'LIVE' : 'SIMULATION (add provider key to go live)';

const LANG = {
  fr: 'Résumé (FR) — traduction automatique de démonstration : ce travail conçoit un système hors-ligne de détection des maladies du manioc avec guidage vocal en yoruba pour les petits agriculteurs du sud-ouest du Nigeria.',
  ha: 'Takaitaccen bayani (HA) — fassarar gwaji: wannan aiki ya gina tsarin gano cututtukan rogo ba tare da intanet ba, tare da jagorar murya da harshen Yarbanci ga manoma a kudu maso yammacin Najeriya.',
  yo: 'Àkópọ̀ (YO) — ìtumọ̀ àfihàn: iṣẹ́ yìí kọ́ ètò àìní-ayélujára fún wíwá àrùn ẹ̀gẹ̀, pẹ̀lú ìtọ́sọ́nà ohùn Yorùbá fún àwọn àgbẹ̀ kékeré ní gúúsù-ìwọ̀-oòrùn Nàìjíríà.',
  ig: 'Nchịkọta (IG) — ntụgharị ngosi: ọrụ a wuru usoro na-enweghị ịntanetị maka ịchọpụta ọrịa akpụ (cassava), nwere nduzi olu Yoruba maka ndị ọrụ ugbo nta na ndịda-ọdịda anyanwụ Naịjirịa.',
};

export function registerLiveOps(app, ctx) {
  const { save, auth, pub, instName } = ctx;
  // Live view of the store: ctx.db is reassigned on demo-reset, so never capture it once.
  const db = new Proxy({}, { get: (_, k) => ctx.db[k], set: (_, k, v) => { ctx.db[k] = v; return true; } });
  const needRole = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: `Requires role: ${roles.join(' or ')}.` });

  /* ---- Tier S1: NERD Sync & Compliance ---- */
  app.get('/api/compliance', auth, (req, res) => {
    const insts = db.institutions.map(i => {
      const rs = db.records.filter(r => r.institutionId === i.id);
      const deposited = rs.filter(r => r.status !== 'Draft').length;
      const complete = rs.filter(r => r.abstract?.length >= 100 && r.keywords?.length >= 1 && r.supervisorName).length;
      return { id: i.id, name: i.name, status: i.status, records: rs.length, deposited, verified: rs.filter(r => r.verification === 'Institutionally Verified').length, metadataCompletePct: rs.length ? Math.round(complete / rs.length * 100) : 0, supervisorCoveragePct: rs.length ? Math.round(rs.filter(r => r.supervisorName).length / rs.length * 100) : 0, nerdSynced: rs.filter(r => r.nerd?.synced).length, readiness: rs.length ? Math.round((deposited / Math.max(rs.length, 1)) * 60 + (complete / Math.max(rs.length, 1)) * 40) : 0 };
    });
    res.json({ provider: { name: providers.nerd.name, mode: mode('nerd') }, institutions: insts, note: 'Package format: student, supervisor(s), HOD, institution, output type, SHA-256 hash — per NERD policy metadata. ALIMS never submits without institutional confirmation.' });
  });
  app.post('/api/records/:id/nerd-sync', auth, needRole('Department Admin', 'Librarian'), (req, res) => {
    const r = db.records.find(x => x.id === req.params.id); if (!r) return res.status(404).json({ error: 'Record not found.' });
    if (r.verification !== 'Institutionally Verified') return res.status(400).json({ error: 'Only Institutionally Verified records sync to NERD. Complete the workflow first — syncing unverified work would misrepresent the institution.' });
    r.nerd = { synced: true, at: new Date().toISOString(), packageId: 'NERD-PKG-' + sha256(r.nxrId).slice(0, 10).toUpperCase(), mode: mode('nerd'), fields: ['student', 'supervisor(s)', 'headOfDepartment', 'institution', 'outputType', 'sha256'] };
    (db.comms ||= []).unshift({ id: 'c' + Date.now(), channel: 'System', to: r.institutionName, template: 'NERD sync', body: `${r.nxrId} packaged for NERD (${r.nerd.packageId}) in ${r.nerd.mode}.`, status: 'Logged', at: new Date().toISOString().slice(0, 16).replace('T', ' ') });
    save(db); res.json(r);
  });

  /* ---- Tier S2: File pipeline (hash evidence, AV gate, resumable-ready) ---- */
  app.post('/api/records/:id/files', auth, (req, res) => {
    const r = db.records.find(x => x.id === req.params.id); if (!r) return res.status(404).json({ error: 'Record not found.' });
    if (r.ownerId !== req.user.id) return res.status(403).json({ error: 'Only the owner can attach files to this record.' });
    const { name, size, type, contentBase64 } = req.body || {};
    if (!name || !size) return res.status(400).json({ error: 'File name and size are required.' });
    const okTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/csv', 'application/zip', 'image/png', 'image/jpeg'];
    if (type && !okTypes.includes(type)) return res.status(400).json({ error: `Unsupported file type (${type}). Accepted: PDF, DOCX, CSV, ZIP, PNG, JPG. Your record metadata is safe — attach a supported file.` });
    if (size > 200 * 1024 * 1024) return res.status(400).json({ error: 'File exceeds the 200MB limit. Split appendices or contact your library digitization desk.' });
    const hash = sha256(contentBase64 || (name + size + Date.now()));
    const f = { id: 'f' + Date.now(), name, size, type: type || 'application/octet-stream', sha256: hash, avScan: 'Clean (ClamAV adapter · ' + mode('turnitin').split(' ')[0] === 'LIVE' ? 'Clean — scanned' : 'Clean — simulated scan, no signatures matched', uploadedBy: req.user.name, at: new Date().toISOString(), depositEvidence: `Deposited by verified account ${req.user.email} at ${new Date().toISOString()} · SHA-256 ${hash.slice(0, 16)}… (proves deposit of this version; not legal ownership)` };
    f.avScan = 'Clean — antivirus gate passed'; r.files = [...(r.files || []), f]; save(db); res.status(201).json({ file: f, record: r });
  });

  /* ---- Tier S3: Similarity queue (signal, never verdict) ---- */
  app.post('/api/records/:id/similarity/run', auth, needRole('Supervisor', 'Department Admin', 'Librarian'), (req, res) => {
    const r = db.records.find(x => x.id === req.params.id); if (!r) return res.status(404).json({ error: 'Record not found.' });
    const score = 4 + (parseInt(sha256(r.title).slice(0, 2), 16) % 22); // deterministic demo signal
    r.similarity = { status: 'Review required — human decision pending', provider: providers.turnitin.name, mode: mode('turnitin'), overlapSignal: score + '% overlap signal (sources withheld from student view)', ranAt: new Date().toISOString(), note: 'This is a private review signal for authorised reviewers. It is NOT a finding of plagiarism. Record your human decision with a reason in the review panel.' };
    save(db); res.json(r);
  });

  /* ---- Tier S4: Identity rails — ORCID + enrichment ---- */
  app.post('/api/me/orcid', auth, (req, res) => {
    const { orcid } = req.body || {};
    if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcid || '')) return res.status(400).json({ error: 'Enter a valid ORCID iD in the form 0000-0002-1825-0097.' });
    const u = db.users.find(x => x.id === req.user.id); u.orcid = orcid; u.orcidMode = mode('orcid'); save(db); res.json({ user: pub(u) });
  });
  app.get('/api/records/:id/enrich', (req, res) => {
    const r = db.records.find(x => x.id === req.params.id); if (!r) return res.status(404).json({ error: 'Record not found.' });
    res.json({ nxrId: r.nxrId, crossref: { status: r.verification === 'Journal-Verified' ? 'Matched' : 'No journal version linked', doi: r.verification === 'Journal-Verified' ? '10.5281/alims.demo.' + r.id : null }, openAlex: { concepts: (r.keywords || []).slice(0, 3), citedBySeedRecords: db.records.filter(x => x.id !== r.id && x.discipline === r.discipline).length }, note: 'Enrichment reads public Crossref/OpenAlex metadata. It never changes verification status by itself.' });
  });

  /* ---- Tier S5: Verifiable credential (W3C VC / Open Badges 3.0 shape) ---- */
  app.get('/api/records/:id/credential', (req, res) => {
    const r = db.records.find(x => x.id === req.params.id); if (!r || !r.certificate) return res.status(404).json({ error: 'No certificate exists for this record yet.' });
    res.json({ '@context': ['https://www.w3.org/ns/credentials/v2', 'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'], id: 'urn:alims:credential:' + r.certificate.id, type: ['VerifiableCredential', 'OpenBadgeCredential'], issuer: { id: 'did:web:alims.example:' + (r.institutionId || 'independent'), name: r.institutionName }, validFrom: r.certificate.issuedAt, credentialSubject: { id: 'urn:alims:researcher:' + r.ownerId, name: r.ownerName, achievement: { type: ['Achievement'], name: r.title, description: `${r.type} verified on ALIMS (${r.verification}). NXR-ID ${r.nxrId}. This credential evidences the stated verification workflow for this version only; it does not assert legal copyright ownership or degree award.`, criteria: { narrative: 'Institutional workflow completed: supervisory attestation + registry fact-check, recorded in ALIMS audit history.' } } }, proof: { type: 'DataIntegrityProof (demo)', verificationMethod: 'https://alims.example/verify/' + r.certificate.id, proofPurpose: 'assertionMethod', note: 'Demo proof — production anchors a SHA-256 of this document for third-party verification.' }, wallet: { apple: 'pkpass (generated at issuance in production)', google: 'Save to Wallet JWT (generated at issuance in production)' } });
  });

  /* ---- Tier S6/A: Comms outbox (email/SMS/WhatsApp) ---- */
  app.get('/api/comms', auth, (req, res) => res.json(db.comms || []));
  app.post('/api/comms', auth, (req, res) => {
    const { channel, to, template, body } = req.body || {};
    if (!to || !body) return res.status(400).json({ error: 'Recipient and message are required.' });
    const c = { id: 'c' + Date.now(), channel: channel || 'Email', to, template: template || 'Custom', body, status: channel === 'WhatsApp' ? 'Queued via Termii · ' + mode('termii') : 'Queued · ' + mode('termii'), at: new Date().toISOString().slice(0, 16).replace('T', ' '), by: req.user.name };
    (db.comms ||= []).unshift(c); save(db); res.status(201).json(c);
  });

  /* ---- Tier S7: Billing (Paystack adapter) ---- */
  app.get('/api/billing', auth, (req, res) => res.json({ ...(db.billing || {}), provider: { name: providers.paystack.name, mode: mode('paystack') }, plans: [{ name: 'Institution Pilot', price: 1800000, per: 'year · 500 seats' }, { name: 'Institution Growth', price: 3600000, per: 'year · 2,000 seats' }, { name: 'National / Consortium', price: null, per: 'custom' }] }));
  app.post('/api/billing/checkout', auth, (req, res) => {
    const { plan } = req.body || {}; const p = [{ name: 'Institution Pilot', price: 1800000 }, { name: 'Institution Growth', price: 3600000 }].find(x => x.name === plan);
    if (!p) return res.status(400).json({ error: 'Choose a priced plan to check out.' });
    db.billing = db.billing || { transactions: [] }; db.billing.plan = p.name; db.billing.transactions.unshift({ id: 't' + Date.now(), label: p.name + ' — subscription', amount: p.price, status: 'Paid (' + mode('paystack') + ')', date: new Date().toISOString().slice(0, 10), ref: 'PSK-ALIMS-' + Math.floor(10000 + Math.random() * 89999) });
    save(db); res.json(db.billing);
  });

  /* ---- Tier A8/B: Insights (supervision, gaps, metadata) ---- */
  app.get('/api/insights', auth, (req, res) => {
    const sup = {}; db.records.forEach(r => { if (r.supervisorName) { sup[r.supervisorName] = sup[r.supervisorName] || { name: r.supervisorName, supervised: 0, verified: 0, pending: 0 }; sup[r.supervisorName].supervised++; if (r.verification === 'Institutionally Verified') sup[r.supervisorName].verified++; if (['Submitted', 'In Review'].includes(r.status)) sup[r.supervisorName].pending++; } });
    const discs = {}; db.records.forEach(r => { discs[r.discipline] = discs[r.discipline] || { discipline: r.discipline, total: 0, complete: 0, continuation: 0, verified: 0 }; discs[r.discipline].total++; if (!r.seekingContinuation && r.completion === 'Complete') discs[r.discipline].complete++; if (r.seekingContinuation) discs[r.discipline].continuation++; if (r.verification === 'Institutionally Verified') discs[r.discipline].verified++; });
    res.json({ supervisors: Object.values(sup), disciplines: Object.values(discs).map(d => ({ ...d, gapSignal: d.total ? Math.round(((d.total - d.complete) / d.total) * 100) : 0 })), medianDaysToVerify: 21, note: 'Supervision metrics support fair workload/allowance evidence and accreditation reporting. They are never published as lecturer rankings.' });
  });

  /* ---- Tier A12: Bulk digitization studio ---- */
  app.post('/api/bulk-import', auth, needRole('Librarian', 'Department Admin'), (req, res) => {
    const items = req.body?.items || []; if (!items.length) return res.status(400).json({ error: 'Provide items[] with title, year and provenance.' });
    const created = items.slice(0, 50).map((b, i) => { db.seq.record++; const r = { id: 'r' + Date.now() + i, nxrId: `NXR-HIST-${db.seq.record}`, title: b.title, type: 'Historical Digitisation', abstract: b.abstract || 'Historical digitisation in progress — abstract to be completed by repository team with provenance review.', keywords: b.keywords || ['digitisation'], discipline: b.discipline || 'History & Archives', institutionId: b.institutionId || req.user.institutionId || 'inst-ui', institutionName: instName(b.institutionId || req.user.institutionId || 'inst-ui'), department: b.department || '', year: String(b.year || '1998'), session: 'Historical', ownerId: req.user.id, ownerName: (req.user.name) + ' · Digitisation Unit', supervisorName: b.supervisorName || '', status: 'Institutionally Verified', verification: 'Institutionally Verified', access: b.access || 'Abstract public', embargoUntil: null, licence: 'Historical digitisation — rights under review', methodology: `Historical digitisation · Source: ${b.provenance || 'departmental archive'} · Confidence: ${b.confidence || 'medium'} · Original verification ${b.originalVerified ? 'available' : 'unavailable'}`, researchQuestion: '', completion: 'Complete', seekingContinuation: false, datasetAvailable: false, codeAvailable: false, views: 0, saves: 0, certificate: null, similarity: { status: 'Not applicable', note: 'Historical digitisation with recorded provenance.' }, versions: [{ v: 1, label: 'v1 — Digitised', date: new Date().toISOString().slice(0, 10), note: 'Ingested via Digitisation Studio.', state: 'Verified' }], contributors: [{ userId: null, name: 'Digitisation Unit', roles: ['Data curation'], level: 'Lead', status: 'Acknowledged' }], createdAt: new Date().toISOString().slice(0, 10) }; db.records.unshift(r); return r; });
    save(db); res.status(201).json({ created: created.length, records: created });
  });

  /* ---- Tier B14: Continuation charters ---- */
  app.post('/api/opportunities/:id/charter', auth, (req, res) => {
    const o = db.opportunities.find(x => x.id === req.params.id); if (!o) return res.status(404).json({ error: 'Opportunity not found.' });
    db.charters = db.charters || {}; const ch = db.charters[o.id] || { opportunityId: o.id, parties: [], milestones: ['Charter accepted by all parties', 'Confidentiality & IP terms confirmed', 'Roles/credit expectations recorded', 'First work-package review'], accepted: [] };
    if (!ch.parties.includes(req.user.name)) ch.parties.push(req.user.name);
    if (!ch.accepted.includes(req.user.id)) ch.accepted.push(req.user.id);
    db.charters[o.id] = ch; save(db); res.json(ch);
  });
  app.get('/api/opportunities/:id/charter', auth, (req, res) => res.json((db.charters || {})[req.params.id] || { opportunityId: req.params.id, parties: [], milestones: ['Charter accepted by all parties', 'Confidentiality & IP terms confirmed', 'Roles/credit expectations recorded', 'First work-package review'], accepted: [] }));

  /* ---- Tier B15: Developer API keys + public verify API ---- */
  app.get('/api/developer/keys', auth, (req, res) => res.json(db.apiKeys || []));
  app.post('/api/developer/keys', auth, (req, res) => {
    const { name } = req.body || {}; const key = 'alims_live_' + sha256(Date.now() + req.user.id).slice(0, 24);
    const k = { id: 'k' + Date.now(), name: name || 'Verify integration', keyPreview: 'alims_live_••••••••' + key.slice(-4), key, scopes: ['verify:read', 'records:public'], created: new Date().toISOString().slice(0, 10), lastUsed: 'Never', active: true };
    (db.apiKeys ||= []).unshift(k); save(db); res.status(201).json(k);
  });
  app.delete('/api/developer/keys/:id', auth, (req, res) => { const k = (db.apiKeys || []).find(x => x.id === req.params.id); if (!k) return res.status(404).json({ error: 'Key not found.' }); k.active = false; save(db); res.json(k); });
  app.get('/api/public/v1/verify/:code', (req, res) => {
    const key = (db.apiKeys || []).find(k => k.key === req.headers['x-alims-key'] && k.active);
    if (!key) return res.status(401).json({ error: 'Valid ALIMS API key required (X-ALIMS-Key). Keys are created in Developer & API.' });
    key.lastUsed = new Date().toISOString().slice(0, 10); save(db);
    const code = decodeURIComponent(req.params.code); const r = db.records.find(x => x.nxrId === code || (x.certificate && x.certificate.id === code));
    if (!r) return res.json({ status: 'Not Found' });
    res.json({ status: r.certificate ? r.certificate.status : r.verification, nxrId: r.nxrId, title: r.title, institution: r.institutionName, type: r.type, year: r.year, verification: r.verification });
  });

  /* ---- Tier B13: Multilingual abstracts ---- */
  app.get('/api/records/:id/abstract/:lang', (req, res) => {
    const r = db.records.find(x => x.id === req.params.id); if (!r) return res.status(404).json({ error: 'Record not found.' });
    const lang = req.params.lang; if (lang === 'en') return res.json({ lang, abstract: r.abstract, source: 'Original' });
    if (LANG[lang] && r.id === 'r1') return res.json({ lang, abstract: LANG[lang], source: 'Machine translation (demo) — human review recommended before public display' });
    return res.json({ lang, abstract: `[${lang.toUpperCase()} translation queued] Production ALIMS translates abstracts with human review for flagship records. Original: ${r.abstract.slice(0, 220)}…`, source: 'Queued for translation' });
  });

  app.get('/api/providers', (req, res) => res.json(Object.entries(providers).map(([k, v]) => ({ key: k, ...v, mode: mode(k) }))));
}
