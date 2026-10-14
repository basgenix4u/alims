import React, { useEffect, useState } from 'react';
import Landing from './Landing';
import { Overview, RecordsPage, RecordDetail, Discover, Lineage, Opportunities, Passport, ReviewQueue, RequestsPage, DisputesPage, InstitutionsPage, VerifyPage, Skeleton } from './Dashboard';
import { api, setSession, getStoredUser, clearSession, getToken } from './api';
import Icon from './icons';
import Logo from './Logo';
import { CompliancePage, InsightsPage, StudioPage, DeveloperPage, BillingPage } from './LiveOps';


class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error('[ALIMS] UI error:', err, info?.componentStack); }
  render() {
    if (this.state.err) return <div style={{ padding: 40, maxWidth: 640, margin: '60px auto', textAlign: 'center' }} className="card">
      <div style={{ display:'grid', placeItems:'center', marginBottom:8, color:'var(--seal)' }}><Icon name="compass" size={44}/></div><h2 style={{ fontSize: 24 }}>Something went wrong displaying this page.</h2>
      <p style={{ color: 'var(--muted)', lineHeight: 1.7 }}>Your records are safe — this was a display error, not a data error. Reloading usually fixes it. If it persists, note what you clicked and contact support.</p>
      <button className="btn primary" onClick={() => location.reload()}>Reload ALIMS</button></div>;
    return this.props.children;
  }
}

const DEMOS = [
  ['amara@demo.alims', 'Student Researcher', 'Amara · UI', 'Create records, submit, build a passport'],
  ['supervisor@demo.alims', 'Supervisor', 'Prof. Chidinma Okonkwo', 'Review queue, confirm supervision'],
  ['admin@demo.alims', 'Department Admin', 'Dr. Ibrahim Musa', 'Verify records, issue certificates'],
  ['library@demo.alims', 'Librarian', 'Mrs. Funke Adeyemi', 'Preservation, embargo & disputes'],
  ['company@demo.alims', 'Company', 'Tunde Bakare · AgriServe', 'Challenges & permissioned contact'],
];

function AuthView({ mode, setMode, onAuthed, toast }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'Student Researcher', institutionId: '' });
  const [busy, setBusy] = useState(false); const [inst, setInst] = useState([]);
  useEffect(() => { api.institutions().then(setInst).catch(() => {}); }, []);
  const demo = async (email) => { setBusy(true); try { const d = await api.login(email, 'demo1234'); setSession(d.token, d.user); onAuthed(d.user); toast(`Welcome back, ${d.user.name}. You are exploring as ${d.user.role}.`); } catch (e) { toast(e.message); } setBusy(false); };
  const submit = async (e) => { e.preventDefault(); setBusy(true); try { const d = mode === 'register' ? await api.register(form) : await api.login(form.email, form.password); setSession(d.token, d.user); onAuthed(d.user); toast(`Welcome, ${d.user.name}. Preserve. Connect. Activate.`); } catch (err) { toast(err.message); } setBusy(false); };
  const ROLE_ICON = { 'Student Researcher': 'graduation-cap', 'Supervisor': 'presentation', 'Department Admin': 'landmark', 'Librarian': 'archive', 'Company': 'building' };
  return <div className="auth-shell">
    <section className="auth-brand" aria-label="About ALIMS">
      <button className="auth-home" onClick={() => setMode(null)} aria-label="Back to home"><Logo size={46} dark tagline /></button>
      <div className="auth-brand-mid">
        <span className="badge dark">The Living Atlas of Knowledge</span>
        <h1>Your research deserves a<br /><em>permanent address.</em></h1>
        <p>Preserve it beyond graduation. Prove what you contributed. Connect it to people, lineage and opportunity — on your terms, with honest verification at every step.</p>
        <ul className="auth-points">
          {[[ 'shield-check', 'Evidence-based verification — never an integrity score' ], [ 'network', 'Lineage mapped: supervision, citation, continuation' ], [ 'lock', 'Embargo-aware access; contact only by consent' ]].map(([ic, txt]) => (
            <li key={txt}><span className="auth-point-ic"><Icon name={ic} size={17} /></span>{txt}</li>))}
        </ul>
      </div>
      <p className="auth-brand-foot mono">NXR-ID REGISTER · QR-VERIFIABLE CERTIFICATES · CRediT CONTRIBUTION LEDGER</p>
    </section>
    <main className="auth-main" id="main-content">
      <div className="auth-card card">
        <div className="auth-card-head">
          <Logo size={38} />
          <div><h2>{mode === 'register' ? 'Create your Academic Passport' : 'Welcome back'}</h2>
          <p>{mode === 'register' ? 'One identity for every record, role and institution.' : 'Sign in to your records, reviews and lineage.'}</p></div>
        </div>
        <div className="tabs auth-tabs" role="tablist" aria-label="Sign in or register">
          <button role="tab" aria-selected={mode === 'login'} className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>Sign in</button>
          <button role="tab" aria-selected={mode === 'register'} className={`tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>Create passport</button>
        </div>
        <form onSubmit={submit}>
          {mode === 'register' && <>
            <div className="field"><label className="lbl" htmlFor="au-name">Full name</label><input id="au-name" className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Chiamaka Nwosu" autoComplete="name" /></div>
            <div className="grid2">
              <div className="field"><label className="lbl" htmlFor="au-role">I am a</label><select id="au-role" className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>{['Student Researcher', 'Supervisor', 'Department Admin', 'Librarian', 'Independent Researcher', 'Company'].map(r => <option key={r}>{r}</option>)}</select></div>
              <div className="field"><label className="lbl" htmlFor="au-inst">Institution (optional)</label><select id="au-inst" className="input" value={form.institutionId} onChange={e => setForm({ ...form, institutionId: e.target.value })}><option value="">Independent</option>{inst.filter(i => i.status === 'Verified').map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
            </div></>}
          <div className="field"><label className="lbl" htmlFor="au-email">Email</label><input id="au-email" className="input" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@university.edu.ng" autoComplete="email" /></div>
          <div className="field"><label className="lbl" htmlFor="au-pass">Password</label><input id="au-pass" className="input" type="password" required minLength={8} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} /></div>
          <button className="btn primary auth-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'register' ? 'Create my Academic Passport' : 'Sign in to ALIMS'}</button>
        </form>
        <div className="auth-divider"><span>Explore a demo role — one click, no card</span></div>
        <div className="auth-demos">
          {DEMOS.map(([email, role, label, desc]) => (
            <button key={email} className="auth-demo" disabled={busy} onClick={() => demo(email)}>
              <span className="auth-demo-ic"><Icon name={ROLE_ICON[role] || 'id-card'} size={19} /></span>
              <span className="auth-demo-txt"><strong>{label}</strong><small>{desc}</small></span>
              <span className="auth-demo-role">{role}</span>
            </button>))}
        </div>
        <p className="auth-note">Demo password for every account: <code>demo1234</code>. Creating an account verifies your identity only — it never claims a university approved your work. Institutional verification is a separate, governed workflow.</p>
        <button className="btn ghost small" onClick={() => setMode(null)}>Back to home</button>
      </div>
      <p className="auth-legal mono">PROTECTED BY ROLE-BASED ACCESS · AUDITED WORKFLOWS · NO PERSONAL DATA IS EVER SOLD</p>
    </main>
  </div>;
}

const NAV = [
  ['overview', 'layout-grid', 'Overview'], ['records', 'folder', 'My Records'], ['discover', 'search', 'Discover'],
  ['lineage', 'network', 'Lineage'], ['opportunities', 'users', 'Opportunities'], ['passport', 'id-card', 'Academic Passport'],
  ['verify', 'badge-check', 'Verify Certificate'], ['review', 'clipboard', 'Review Queue'], ['requests', 'mail', 'Access Requests'],
  ['disputes', 'scale', 'Disputes'], ['institutions', 'landmark', 'Institutions'], ['compliance', 'badge-check', 'NERD Compliance'], ['insights', 'compass', 'Insights'], ['studio', 'archive', 'Digitisation Studio'], ['developer', 'code', 'Developer & API'], ['billing', 'database', 'Billing & Plans'],
];

function AppShell() {
  const [user, setUser] = useState(getStoredUser());
  const [authMode, setAuthMode] = useState(null); // null=landing, 'login'/'register'
  const [page, setPage] = useState('overview');
  const [param, setParam] = useState('');
  const [toasts, setToasts] = useState([]);
  const [open, setOpen] = useState(false);
  const [institutions, setInstitutions] = useState([]);
  const [researchers, setResearchers] = useState([]);
  const [allRecords, setAllRecords] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [booting, setBooting] = useState(!!getToken());

  const toast = (msg) => { const id = Date.now() + Math.random(); setToasts(t => [...t, { id, msg }]); setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5200); };
  const go = (dest) => { const [p, pr] = String(dest).split(/:(.+)/).filter(Boolean); if (p === 'records' && pr === 'new') { setPage('records'); setTimeout(() => document.querySelector('.page .btn.primary')?.click(), 60); } else if (p === 'opportunities' && pr === 'new') { setPage('opportunities'); } else { setPage(p); setParam(pr || ''); } setOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  useEffect(() => { if (getToken()) { api.me().then(d => { if (d.user) setUser(d.user); }).catch(() => { clearSession(); setUser(null); }).finally(() => setBooting(false)); } else setBooting(false); }, []);
  useEffect(() => { if (user) { api.institutions().then(setInstitutions).catch(() => {}); api.researchers().then(setResearchers).catch(() => {}); api.records().then(rs => { setAllRecords(rs); setPendingCount(rs.filter(r => ['Submitted', 'In Review'].includes(r.status)).length); }).catch(() => {}); } }, [user, page]);

  // hash-based public verify: #/verify/CODE
  useEffect(() => { const h = location.hash; const m = h.match(/#\/verify\/(.+)/); if (m) { setPage('verify'); setParam(decodeURIComponent(m[1])); if (!user) setAuthMode('__verify__'); } }, []);

  const logout = () => { clearSession(); setUser(null); setAuthMode(null); setPage('overview'); toast('Signed out. Your records remain safely preserved on ALIMS.'); };
  const loginAs = (mode = 'login') => { setAuthMode(mode); window.scrollTo(0, 0); };
  const demo = async (email) => { try { const d = await api.login(email, 'demo1234'); setSession(d.token, d.user); setUser(d.user); setAuthMode(null); toast(`Welcome, ${d.user.name} — exploring as ${d.user.role}.`); } catch (e) { toast(e.message); setAuthMode('login'); } };

  if (booting) return <div style={{ padding: 40, maxWidth: 900, margin: '0 auto' }}><Skeleton rows={4} /></div>;

  // Public verify standalone (no sign-in)
  if (!user && authMode === '__verify__') return <div style={{ padding: '36px 18px' }}><button className="btn ghost small" onClick={() => { location.hash = ''; setAuthMode(null); }}>← ALIMS home</button><div style={{ marginTop: 20 }}><VerifyPage initial={param} /></div><ToastStack toasts={toasts} /></div>;
  if (!user && authMode) return <><AuthView mode={authMode === 'register' ? 'register' : 'login'} setMode={setAuthMode} onAuthed={(u) => { setUser(u); setAuthMode(null); }} toast={toast} /><ToastStack toasts={toasts} /></>;
  if (!user) return <><Landing onLogin={loginAs} onDemo={demo} /><ToastStack toasts={toasts} /></>;

  const title = NAV.find(n => n[0] === page)?.[2] || (page === 'record' ? 'Research Record' : 'ALIMS');
  return <div className="shell">
    <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="App navigation">
      <div style={{ padding: '20px 18px 8px' }}><Logo size={40} dark />
        <p style={{ fontSize: 12, color: '#94A3B8', margin: '8px 0 0' }}>Preserve · Connect · Activate</p></div>
      <nav>{NAV.map(([key, ic, label]) => <button key={key} className={`side-link ${page === key ? 'active' : ''}`} aria-current={page === key ? 'page' : undefined} onClick={() => go(key)}><Icon name={ic} size={19}/>{label}{key === 'review' && pendingCount > 0 && <span className="cnt">{pendingCount}</span>}</button>)}</nav>
      <div style={{ marginTop: 'auto', padding: 16, borderTop: '1px solid rgba(255,255,255,.1)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span className="avatar">{(user.name || 'A').split(' ').map(s => s[0]).slice(0, 2).join('')}</span>
          <div style={{ minWidth: 0 }}><strong style={{ color: '#fff', fontSize: 14, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</strong><span style={{ fontSize: 12, color: '#94A3B8' }}>{user.role}</span></div></div>
        <button className="btn ghost small" style={{ width: '100%', justifyContent: 'center', marginTop: 12, background: 'rgba(255,255,255,.08)', color: '#fff', borderColor: 'rgba(255,255,255,.2)' }} onClick={logout}>Sign out</button>
        <button className="btn ghost small" style={{ width: '100%', justifyContent: 'center', marginTop: 8, background: 'transparent', color: '#94A3B8', borderColor: 'rgba(255,255,255,.15)' }} onClick={() => { clearSession(); setUser(null); setAuthMode(null); }}>View public site</button>
      </div>
    </aside>
    <div className="main">
      <div className="topbar">
        <button className="hamb" onClick={() => setOpen(!open)} aria-label="Toggle navigation"><Icon name="menu" size={19}/></button>
        <strong style={{ fontFamily: 'Fraunces,serif', fontSize: 20 }}>{title}</strong>
        <span className="badge green" style={{ marginLeft: 4 }}>{user.role}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn ghost small" onClick={() => go('discover')}><Icon name="search" size={15}/> Search</button>
          <button className="btn primary small" onClick={() => go('records')}>+ New Record</button>
        </div>
      </div>
      <main className="page" id="main-content">
        {page === 'overview' && <Overview user={user} go={go} toast={toast} />}
        {page === 'records' && <RecordsPage user={user} go={go} toast={toast} />}
        {page === 'record' && <RecordDetail id={param} user={user} go={go} toast={toast} />}
        {page === 'discover' && <Discover go={go} toast={toast} />}
        {page === 'lineage' && <Lineage go={go} />}
        {page === 'opportunities' && <Opportunities user={user} go={go} toast={toast} />}
        {page === 'passport' && <Passport user={user} researchers={researchers.length ? researchers : [user]} go={go} />}
        {page === 'verify' && <VerifyPage initial={param} />}
        {page === 'review' && <ReviewQueue user={user} go={go} toast={toast} />}
        {page === 'requests' && <RequestsPage user={user} toast={toast} />}
        {page === 'disputes' && <DisputesPage user={user} records={allRecords} toast={toast} />}
        {page === 'institutions' && <InstitutionsPage institutions={institutions} />}
        {page === 'compliance' && <CompliancePage user={user} records={allRecords} toast={toast} />}
        {page === 'insights' && <InsightsPage toast={toast} />}
        {page === 'studio' && <StudioPage user={user} toast={toast} go={go} />}
        {page === 'developer' && <DeveloperPage toast={toast} />}
        {page === 'billing' && <BillingPage toast={toast} />}
      </main>
      <footer style={{ padding: '22px 28px', borderTop: '1px solid var(--line)', color: 'var(--muted)', fontSize: 13, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <span>ALIMS — Preserve knowledge. Connect lineage. Activate impact.</span><span>No integrity scores. No automated accusations. Humans decide.</span>
      </footer>
    </div>
    <ToastStack toasts={toasts} />
  </div>;
}
function ToastStack({ toasts }) { return <div className="toast-wrap" role="status" aria-live="polite">{toasts.map(t => <div key={t.id} className="toast">{t.msg}</div>)}</div>; }

export default function App() {
  return (<ErrorBoundary>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <AppShell />
  </ErrorBoundary>);
}
