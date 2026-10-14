import React, { useEffect, useState } from 'react';
import { api } from './api';
import Icon from './icons';
import Logo, { LogoMark } from './Logo';

export function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    const io = new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
    els.forEach(el => io.observe(el)); return () => io.disconnect();
  }, []);
}

const FEATURES = [
  { ic: 'shield-check', t: 'The Trusted Research Record', d: 'Every output — project, thesis, dissertation, dataset, software, patent disclosure — becomes a durable Research Record with a permanent NXR-ID, version history and deposit evidence. A record is far more than a file.' },
  { ic: 'badge-check', t: 'Evidence-based verification', d: 'Distinct, honest labels: Self-Published, Identity-Verified Deposit, Supervisor-Verified, Institutionally Verified, Journal-Verified. ALIMS never confuses deposit evidence with legal ownership — and never issues an “integrity score”.' },
  { ic: 'graduation-cap', t: 'Academic Passport', d: 'A portable, evidence-backed identity for every researcher: verified affiliations, Research Records, CRediT contribution roles, supervision and outcomes — labelled by evidence source, never reduced to an opaque ranking.' },
  { ic: 'network', t: 'Academic lineage graph', d: 'Supervision, citation, builds-on, continues, replicates, resulted-in — every relationship is typed and evidence-qualified. Machine suggestions are labelled as suggestions until a human confirms them.' },
  { ic: 'lock', t: 'Openness with control', d: 'Metadata can be discoverable while full text stays embargoed or restricted. Access requests, embargoes and consent-based contact protect students, IP and unpublished work by design.' },
  { ic: 'rocket', t: 'Research activation', d: 'Verified companies and funders discover permitted knowledge and request introductions through ALIMS. Incomplete research finds continuation partners. Discovery never transfers rights or exposes private data.' },
];

const FAQS = [
  { q: 'Is ALIMS a plagiarism checker or a repository?', a: 'Neither alone. ALIMS is academic knowledge infrastructure: it preserves Research Records, runs institutional verification workflows, records contribution and lineage, and activates permitted knowledge. Similarity outputs, where an institution uses them, are private review signals for authorised humans — never automatic accusations, public labels, or rejections (PRD §6.5).' },
  { q: 'Does an NXR-ID mean ALIMS owns or legally certifies my work?', a: 'No. An NXR-ID proves that an ALIMS Research Record exists and records deposit/version evidence. It is not a DOI, not a copyright registration, and not a legal ownership determination. Certificates state only approved verification facts and never claim a degree was awarded unless your institution authorises that statement.' },
  { q: 'Can my full thesis stay private?', a: 'Yes. You choose metadata-only, abstract-public, full-public, institution-only or restricted access, plus embargo periods where policy allows. Public discovery can show permitted metadata and verification status while the full file remains inaccessible. Nothing becomes public contrary to active rights restrictions.' },
  { q: 'I’m an independent researcher with no university. Can I use ALIMS?', a: 'Yes — hybrid access is core to ALIMS. Your work is labelled Self-Published or Identity-Verified Deposit with timestamped deposit evidence. It can never display “Institutionally Verified” without completing a real institutional process, which protects both you and the meaning of verification.' },
  { q: 'How do employers verify a certificate?', a: 'They scan the QR code or enter the NXR-ID / certificate number on the public verification page. They see only approved public facts — title, researcher (where permitted), institution, type, year and certificate status (Valid, Superseded, Revoked or Not Found). Grades, student IDs, review notes and embargoed files are never disclosed.' },
  { q: 'How do companies contact researchers?', a: 'Only through permissioned introductions. Verified companies send a request through ALIMS; the researcher and, where configured, their institution accept, decline or ask for more detail. Declines are neutral, private contact details are never harvested, and discovering a record grants no IP rights whatsoever.' },
];

export default function Landing({ onLogin, onDemo }) {
  useReveal();
  const [stats, setStats] = useState(null);
  const [faq, setFaq] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [verifyCode, setVerifyCode] = useState('NXR-2025-01041');
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  useEffect(() => { api.stats().then(setStats).catch(() => {}); }, []);

  const doVerify = async (e) => { e.preventDefault(); setVerifying(true); try { setVerifyResult(await api.verify(verifyCode)); } catch (err) { setVerifyResult({ status: 'Error', message: err.message }); } setVerifying(false); };

  return (<div>
    {/* NAV */}
    <header className="nav"><div className="container nav-in">
      <a className="logo" href="#top" aria-label="ALIMS home"><Logo size={40} /></a>
      <nav className="nav-links" aria-label="Primary">
        <a href="#features">Platform</a><a href="#how">How it works</a><a href="#lineage">Lineage</a><a href="#who">Who it serves</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a>
      </nav>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="nav-burger" onClick={() => setMenuOpen(o => !o)} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen}><Icon name="menu" size={19}/></button>
        <button className="btn ghost small" onClick={() => onLogin()}>Sign in</button>
        <button className="btn primary small" onClick={() => onLogin('register')}>Get started</button>
      </div>
    </div>
    {menuOpen && <nav className="nav-menu open" aria-label="Mobile">
      <a href="#features" onClick={() => setMenuOpen(false)}>Platform</a>
      <a href="#how" onClick={() => setMenuOpen(false)}>How it works</a>
      <a href="#lineage" onClick={() => setMenuOpen(false)}>Lineage</a>
      <a href="#who" onClick={() => setMenuOpen(false)}>Who it serves</a>
      <a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
      <a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
    </nav>}
    </header>


    {/* LIVE REGISTER TICKER */}
    <div className="ticker" aria-hidden="true"><div className="ticker-track">
      {[0,1].map(k => <React.Fragment key={k}>{[
        ['NXR-2025-01041','Cassava Disease AI · University of Ibadan · Verified'],
        ['NXR-2023-00712','Yoruba Machine Translation · Journal-Verified'],
        ['NXR-2025-01103','Drought-Tolerant Sorghum · ABU · Seeking Continuation'],
        ['NXR-2024-00987','Self-Medication Study · UNILAG · Verified'],
        ['NXR-2022-00590','1978 Reforms Oral Histories · OAU · Digitised'],
        ['NXR-2025-01077','Bambara School Meals · UNN · Verified'],
      ].map(([id,txt]) => <span key={k+id}><Icon name="asterisk" size={12}/> <b>{id}</b> — {txt}</span>)}</React.Fragment>)}
    </div></div>

    {/* HERO */}
    <section className="hero" id="top"><div className="container hero-grid">
      <div>
        <span className="badge dark"><Icon name="asterisk" size={12}/>&nbsp;THE LIVING ATLAS OF KNOWLEDGE — EST. NIGERIA, FOR THE WORLD</span>
        <h1>Knowledge has<br /><em>ancestors.</em> We<br />map them <span className="burst">forever.</span></h1>
        <p className="lead">ALIMS gives every thesis, project, dataset and discovery a durable, verifiable <strong>Research Record</strong> — connected to the people, supervisors, institutions and follow-on work that give it meaning, and discoverable only to the extent its owners allow.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 28 }}>
          <button className="btn gold" onClick={() => onDemo('amara@demo.alims')}>Explore the live demo →</button>
          <a className="btn ghost" href="#verify">Verify a certificate</a>
        </div>
        <p className="trace">Demo accounts for every role — student, supervisor, admin, librarian, company · no card required · data shown is seeded demo data</p>
        <div className="hero-stats" style={{ display: 'flex', gap: 38, marginTop: 34, flexWrap: 'wrap' }}>
          <div><div className="stat-num">{stats ? stats.records : '—'}</div><div className="stat-lbl">Research Records</div></div>
          <div><div className="stat-num">{stats ? stats.institutions : '—'}</div><div className="stat-lbl">Verified institutions</div></div>
          <div><div className="stat-num">{stats ? stats.certificates : '—'}</div><div className="stat-lbl">Certificates issued</div></div>
          <div><div className="stat-num">2s</div><div className="stat-lbl">Public verify target</div></div>
        </div>
      </div>
      <div className="hero-frame">
        <svg className="seal-rotor" viewBox="0 0 120 120" role="img" aria-label="ALIMS seal: Preserve, Connect, Activate">
          <defs><path id="circ" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0"/></defs>
          <circle cx="60" cy="60" r="58" fill="#131109"/><circle cx="60" cy="60" r="34" fill="none" stroke="#F2B33D" strokeWidth="1.4" strokeDasharray="3 4"/>
          <text fill="#F2B33D" fontSize="11.5" fontWeight="700" letterSpacing="3.5" fontFamily="IBM Plex Mono, monospace"><textPath href="#circ">PRESERVE · CONNECT · ACTIVATE · </textPath></text>
          <text x="60" y="68" textAnchor="middle" fill="#FFF3CF" fontSize="21" fontFamily="Fraunces, serif" fontStyle="italic">A</text>
        </svg>
        
        <img className="hero-img" fetchPriority="high" decoding="async" src="/hero-campus.jpg" alt="Researchers collaborating in a university library in Nigeria" />
        <div style={{ position:'absolute', top: 16, right: 16 }}><span className="stamp"><Icon name="badge-check" size={14}/> Institutionally Verified</span></div>
        <div className="glass" style={{ position: 'absolute', left: 18, bottom: 18, right: 18, borderRadius: 14, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: '#111111', lineHeight: 1.45 }}><strong>NXR-2025-01041</strong> · Cassava disease AI, UI<br /><span style={{ color: '#5B6577' }}>QR-verifiable · v3 · Embargo-aware</span></div>
        </div>
      </div>
    </div></section>

    {/* SOCIAL PROOF */}
    <section style={{ padding: '34px 0', borderBottom: '1px solid var(--line)', background: '#fff' }} aria-label="Institutions">
      <div className="container" style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '.12em', color: 'var(--muted)' }}>DESIGNED WITH & FOR LEADING INSTITUTIONS</span>
        {['University of Ibadan', 'University of Lagos', 'Obafemi Awolowo University', 'University of Nigeria, Enugu State', 'Ahmadu Bello University'].map(n => <span key={n} style={{ fontFamily: 'Fraunces,serif', fontWeight: 600, fontSize: 17, color: '#334155' }}>{n}</span>)}
      </div>
    </section>

    {/* PROBLEM */}
    <section className="section"><div className="container">
      <div className="reveal"><span className="eyebrow">01 · The problem</span>
        <h2 className="sec-title">Brilliant research is disappearing<br />before it can change anything.</h2>
        <p className="sec-sub">Final-year projects sit in departmental cupboards. Theses vanish with a lost laptop. Employers can’t verify what a graduate actually did. Companies can’t find the expertise that already exists. ALIMS — aligned with Nigeria’s NERD policy ambition and UNESCO’s Open Science principles — fixes the infrastructure, not just the storage.</p></div>
      <div className="feat-grid">
        {[['archive', 'Fragmented & fragile', 'Work is scattered across physical libraries, personal drives, emails and portals — vulnerable to loss at graduation, retirement or a single failed hard drive.'],
          ['file-question', 'Impossible to verify', 'A PDF proves nothing about who did the work, who supervised it, which version is authoritative, or whether an institution ever approved it.'],
          ['blocks', 'Invisible connections', 'Supervision, contribution, datasets, follow-on work and industry relevance stay hidden — so knowledge is duplicated instead of built upon.']
        ].map(([ic, t, d], i) => (<article key={t} className={`feat reveal d${i + 1}`}><div className="ic"><Icon name={ic} size={24}/></div><h3>{t}</h3><p>{d}</p></article>))}
      </div>
    </div></section>

    {/* FEATURES */}
    <section className="section alt" id="features"><div className="container">
      <div className="reveal"><span className="eyebrow">02 · The platform</span>
        <h2 className="sec-title">One governed ecosystem, from first draft<br />to real-world impact.</h2>
        <p className="sec-sub">Fifteen capabilities in the PRD, one coherent product: institutional workflows, provenance, contribution, lineage, discovery and activation — with human judgement where it matters.</p></div>
      <div className="feat-grid">{FEATURES.map((f, i) => (<article key={f.t} className={`feat reveal d${(i % 3) + 1}`}><span className="fnum">SPECIMEN / 0{i + 1}</span><div className="ic"><Icon name={f.ic} size={24}/></div><h3>{f.t}</h3><p>{f.d}</p></article>))}</div>
    </div></section>

    {/* HOW IT WORKS */}
    <section className="section" id="how"><div className="container">
      <div className="reveal"><span className="eyebrow">03 · How it works</span><h2 className="sec-title">The official journey, made calm and auditable.</h2></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 18, marginTop: 40 }} className="how-grid">
        {[['01', 'Deposit & declare', 'A student creates a Research Record, declares CRediT contributor roles and supervisors, chooses access/embargo, and uploads. ALIMS confirms receipt — nothing is “verified” yet, and it says so.'],
          ['02', 'Supervise & review', 'Supervisors approve, return with structured feedback, or escalate. Revisions become new versions — submitted evidence is never silently overwritten. Similarity is a private review signal, never an accusation.'],
          ['03', 'Verify & certify', 'Registry fact-checks complete the workflow. The chosen version becomes Institutionally Verified with an NXR-ID and a QR-verifiable certificate anyone can check in seconds.'],
          ['04', 'Discover & activate', 'The record, passport and lineage become discoverable to the extent allowed. Collaborators continue unfinished work; verified companies request permissioned introductions.']]
          .map(([n, t, d], i) => (<div key={n} className={`card reveal d${i + 1}`} style={{ padding: 26 }}><div style={{ fontFamily: 'Fraunces,serif', fontSize: 34, color: 'var(--seal)' }}>{n}</div><h3 style={{ margin: '10px 0 8px', fontSize: 19 }}>{t}</h3><p style={{ color: 'var(--muted)', fontSize: 14.5, lineHeight: 1.65, margin: 0 }}>{d}</p></div>))}
      </div>
      <style>{`@media(max-width:920px){.how-grid{grid-template-columns:1fr 1fr!important}}@media(max-width:560px){.how-grid{grid-template-columns:1fr!important}}`}</style>

      {/* VERIFY SHOWCASE */}
      <div id="verify" className="reveal verify-grid" style={{ marginTop: 56, background: 'linear-gradient(160deg,#F1EDFF,#FFFFFF 70%)', border: '1.5px solid #111111', boxShadow: '5px 5px 0 #111111', borderRadius: 14, padding: '36px', color: '#111111', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }} >
        <div>
          <span className="badge dark">PUBLIC VERIFICATION</span>
          <h3 style={{ fontSize: 30, margin: '14px 0 10px' }}>Scan. Check. Trust — in under two seconds.</h3>
          <p style={{ color: '#3F3D36', lineHeight: 1.7, fontSize: 15.5 }}>Try it now with a real seeded record. Employers see only approved public facts — never grades, student IDs, review notes or embargoed files. Try <code style={{ color: '#F6E27A' }}>NXR-2025-01041</code> or certificate <code style={{ color: '#F6E27A' }}>CERT-UNN-2025-1176</code> (superseded) to feel the difference.</p>
          <form onSubmit={doVerify} style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <input className="input" style={{ flex: 1, minWidth: 220 }} value={verifyCode} onChange={e => setVerifyCode(e.target.value)} aria-label="NXR-ID or certificate number" placeholder="Enter NXR-ID or certificate no." />
            <button className="btn gold" disabled={verifying}>{verifying ? 'Checking…' : 'Verify'}</button>
          </form>
        </div>
        <div style={{ background: '#fff', border: '1.5px solid #111111', borderRadius: 14, boxShadow: '3px 3px 0 #111111', padding: 24, minHeight: 210 }} aria-live="polite">
          {!verifyResult && <div style={{ color: '#5B5B5B', fontSize: 15, lineHeight: 1.7 }}>The verification result will appear here — Valid, Superseded, Revoked or Not Found, exactly as an employer would see it.</div>}
          {verifyResult && (<div className="fade-in">
            <span className={`badge ${verifyResult.status === 'Valid' ? 'green' : verifyResult.status === 'Not Found' ? 'red' : 'amber'}`} style={{ fontSize: 13 }}>{verifyResult.status === 'Valid' ? <><Icon name="check" size={14}/> VALID</> : verifyResult.status}</span>
            {verifyResult.title ? (<>
              <h4 style={{ fontFamily: 'Fraunces,serif', fontSize: 20, margin: '14px 0 6px', lineHeight: 1.35 }}>{verifyResult.title}</h4>
              <p style={{ color: '#3F3D36', fontSize: 14, lineHeight: 1.7, margin: 0 }}>{verifyResult.nxrId} · {verifyResult.institution}<br />{verifyResult.type} · {verifyResult.year} · {verifyResult.verification}<br />Researchers: {(verifyResult.researchers || []).join(', ')}</p>
              <p className="trace">{verifyResult.note}</p></>) :
              <p style={{ color: '#3F3D36', lineHeight: 1.7 }}>{verifyResult.message}</p>}
          </div>)}
        </div>
      </div>
    </div></section>

    {/* LINEAGE SHOWCASE */}
    <section className="section alt" id="lineage"><div className="container lineage-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
      <div className="reveal">
        <span className="eyebrow">04 · Academic lineage</span>
        <h2 className="sec-title">Knowledge has ancestors.<br />ALIMS maps them honestly.</h2>
        <p className="sec-sub">Explore how a 2023 Yoruba translation breakthrough <em>built into</em> a 2025 cassava-diagnosis product used by real farmers — who supervised, who contributed what, and what it led to next. Supervision is mentorship, never implied ownership; every edge is typed and evidence-qualified.</p>
        <ul style={{ lineHeight: 2, color: 'var(--ink2)', fontSize: 15.5, paddingLeft: 20 }}>
          <li><strong>Typed relationships</strong> — supervised-by, cites, builds-on, continues, replicates, resulted-in…</li>
          <li><strong>Evidence states</strong> — verified, self-declared, imported, or machine-suggested (never public until accepted).</li>
          <li><strong>Explainable suggestions</strong> — “shared method + complementary skills”, with confidence in plain language.</li>
        </ul>
        <button className="btn primary" onClick={() => onDemo('amara@demo.alims')} style={{ marginTop: 10 }}>Open the interactive lineage map →</button>
      </div>
      <div className="reveal d2 card" style={{ padding: 26, background: 'linear-gradient(170deg,#fff,#F4F1FF)' }} role="img" aria-label="Illustration of an academic lineage graph connecting a professor, two research records, a student and a company challenge">
        <svg viewBox="0 0 520 340" style={{ width: '100%', height: 'auto' }}>
          <defs><marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#0B6B4A" /></marker></defs>
          {[[260,60,150,150],[260,60,380,150],[150,160,150,265],[380,160,380,265],[260,60,260,150]].map((l,i)=>(<line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} className="lineage-line" stroke="#0B6B4A" strokeWidth="2" strokeDasharray={i===4?'5 5':'0'} markerEnd="url(#ar)" opacity=".65"/>))}
          {[[260,45,'Prof. Chidinma Okonkwo','Supervisor · UI'],[140,150,'Yoruba MT (2023)','Journal-Verified'],[380,150,'Cassava AI (2025)','Institutionally Verified'],[140,272,'Corpus & code','Dataset available'],[380,272,'AgriServe challenge','Resulted in → industry']].map(([x,y,t,s],i)=>(
            <g key={i}><rect x={x-95} y={y-30} width="190" height="60" rx="14" fill="#fff" stroke="#E7E2D6" /><text x={x} y={y-3} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="#111111">{t}</text><text x={x} y={y+16} textAnchor="middle" fontSize="10.5" fill="#5B6577">{s}</text></g>))}
          <text x="205" y="112" fontSize="10.5" fill="#0B6B4A" fontWeight="700">builds on</text>
          <text x="268" y="112" fontSize="10.5" fill="#8A4B08" fontWeight="700">supervised</text>
          <text x="330" y="225" fontSize="10.5" fill="#0B6B4A" fontWeight="700">resulted in</text>
        </svg>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', textAlign: 'center', margin: '8px 0 0' }}>Illustrative lineage — explore the live, filterable graph inside the demo.</p>
      </div>
    </div></section>

    {/* WHO IT SERVES */}
    <section className="section" id="who"><div className="container">
      <div className="reveal"><span className="eyebrow">05 · Who it serves</span><h2 className="sec-title">Built for every hand that touches knowledge.</h2></div>
      <div className="feat-grid">
        {[['graduation-cap', 'Students & graduates', 'Preserve work beyond graduation, control what’s public, and carry a QR-verifiable record employers can trust — a portfolio of evidence, not just a degree title.'],
          ['presentation', 'Supervisors', 'One queue for assigned work, versions and declared contributors. Confirm mentorship without accidentally claiming ownership of a student’s research.'],
          ['landmark', 'Universities & libraries', 'Governed workflows, embargo and retention policy, historic digitisation with provenance, certificate integrity, and reporting leadership can actually use.'],
          ['flask', 'Independent researchers', 'A portable, credible identity and timestamped deposit evidence — discoverable on your terms, never dressed up as institutional approval.'],
          ['building', 'Companies & funders', 'Find verified research, labs and unfinished work worth continuing. Request governed introductions; IP boundaries are explicit from the first click.'],
          ['globe', 'Employers & the public', 'Verify any certificate in seconds and see exactly what was verified — and what was not. No private academic data, ever.']]
          .map(([ic, t, d], i) => (<article key={t} className={`feat reveal d${(i % 3) + 1}`}><div className="ic"><Icon name={ic} size={24}/></div><h3>{t}</h3><p>{d}</p></article>))}
      </div>
    </div></section>

    {/* TESTIMONIALS */}
    <section className="section alt"><div className="container">
      <div className="reveal"><span className="eyebrow">06 · Voices from campus</span><h2 className="sec-title">People protect what they can prove.</h2></div>
      <div className="tst">
        {[['“My project used to be a PDF on a flash drive. Now a cooperative in Ido actually pilots it, and any employer can verify it with one scan. That changed what I believe my degree is worth.”', 'Amara Okafor', 'BSc Computer Science, University of Ibadan', 'AO'],
          ['“For the first time I can see every supervised version, every declared contribution, and every pending decision in one place — and my supervision is honoured as mentorship, not mistaken for authorship.”', 'Prof. Chidinma Okonkwo', 'Professor of Computer Science, UI', 'BO'],
          ['“We found a verified cold-chain scheduling study, requested an introduction properly, and had a chartered pilot running in six weeks. No scraped emails, no IP grey areas.”', 'Tunde Bakare', 'Innovation Lead, AgriServe Technologies', 'TB']]
          .map(([q, n, r, av], i) => (<figure key={n} className={`tst-card reveal d${i + 1}`} style={{ margin: 0 }}>
            <div style={{ color: '#D9481F', display:'flex', gap:2 }} role="img" aria-label="Rated 5 out of 5">{[0,1,2,3,4].map(s=><Icon key={s} name="star" size={15}/>)}</div>
            <blockquote style={{ margin: '14px 0 20px', lineHeight: 1.75, fontSize: 15.5, color: 'var(--ink2)' }}>{q}</blockquote>
            <figcaption style={{ display: 'flex', gap: 12, alignItems: 'center' }}><span className="avatar">{av}</span><span><strong style={{ display: 'block', fontSize: 14.5 }}>{n}</strong><span style={{ fontSize: 13, color: 'var(--muted)' }}>{r}</span></span></figcaption>
          </figure>))}
      </div>
    </div></section>

    {/* PRICING */}
    <section className="section" id="pricing"><div className="container">
      <div className="reveal" style={{ textAlign: 'center' }}><span className="eyebrow" style={{ justifyContent: 'center' }}>07 · Pricing</span>
        <h2 className="sec-title">Institution-led, researcher-friendly.</h2>
        <p className="sec-sub" style={{ margin: '0 auto' }}>Institutions fund the infrastructure; researchers keep their passports. Final pricing is agreed per institution size, workflow depth and digitisation scope.</p></div>
      <div className="price-grid">
        <div className="price reveal"><h3 style={{ fontSize: 21, margin: 0 }}>Independent</h3><p style={{ color: 'var(--muted)', fontSize: 14 }}>For individual researchers</p>
          <div style={{ fontFamily: 'Fraunces,serif', fontSize: 40, margin: '14px 0 4px' }}>Free</div><p style={{ fontSize: 13, color: 'var(--muted)' }}>Forever for core deposits</p>
          <ul><li>Academic Passport & profile controls</li><li>Self-published records with deposit evidence</li><li>Public discovery & collaboration opportunities</li><li>Access-request inbox</li></ul>
          <button className="btn ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => onLogin('register')}>Create free passport</button></div>
        <div className="price hot reveal d2"><span className="badge green" style={{ position: 'absolute', top: -13, right: 22 }}>MOST ADOPTED</span>
          <h3 style={{ fontSize: 21, margin: 0 }}>Institution</h3><p style={{ color: 'var(--muted)', fontSize: 14 }}>For universities & polytechnics</p>
          <div style={{ fontFamily: 'Fraunces,serif', fontSize: 40, margin: '14px 0 4px' }}>Custom</div><p style={{ fontSize: 13, color: 'var(--muted)' }}>Per-institution annual agreement</p>
          <ul><li>Branded institutional space & governed workflows</li><li>Supervisor → registry verification & certificates</li><li>Embargo, retention & similarity-review governance</li><li>Historic digitisation & repository tools</li><li>Institution reporting & audit history</li></ul>
          <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => onDemo('admin@demo.alims')}>See the institution demo</button></div>
        <div className="price reveal d3"><h3 style={{ fontSize: 21, margin: 0 }}>National / Consortium</h3><p style={{ color: 'var(--muted)', fontSize: 14 }}>For ministries, funders & networks</p>
          <div style={{ fontFamily: 'Fraunces,serif', fontSize: 40, margin: '14px 0 4px' }}>Custom</div><p style={{ fontSize: 13, color: 'var(--muted)' }}>Multi-institution programmes</p>
          <ul><li>Cross-institution discovery & lineage</li><li>Alignment reporting for national repositories</li><li>Research-gap & activation intelligence</li><li>Priority support, training & policy co-design</li></ul>
          <button className="btn ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => onLogin()}>Talk to our team</button></div>
      </div>
      <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13.5, marginTop: 22 }}>Companies join free to search permitted knowledge; posting challenges and sponsored inquiries is verified and may be billed per programme. ALIMS never sells student work or personal data.</p>
    </div></section>

    {/* FAQ */}
    <section className="section alt" id="faq"><div className="container" style={{ maxWidth: 860 }}>
      <div className="reveal"><span className="eyebrow">08 · FAQ</span><h2 className="sec-title">Honest answers, by design.</h2></div>
      <div style={{ marginTop: 32 }}>{FAQS.map((f, i) => (
        <div className="faq-item reveal" key={f.q}>
          <button className="faq-q" onClick={() => setFaq(faq === i ? -1 : i)} aria-expanded={faq === i}>{f.q}<span aria-hidden="true" style={{ fontSize: 20, color: 'var(--emerald)' }}>{faq === i ? '−' : '+'}</span></button>
          {faq === i && <div className="faq-a fade-in">{f.a}</div>}
        </div>))}</div>
    </div></section>

    {/* CTA */}
    <section style={{ padding: '0 0 92px', background: '#fff' }}><div className="container">
      <div className="reveal" style={{ background: 'linear-gradient(140deg,#131109,#1E2B1A)', borderRadius: 28, padding: '52px 36px', textAlign: 'center', color: '#fff', position: 'relative', overflow: 'hidden' }}>
        <h2 style={{ fontSize: 'clamp(28px,4vw,44px)', margin: '0 0 14px' }}>Preserve knowledge. Connect lineage.<br />Activate impact.</h2>
        <p style={{ color: '#F2B33D', fontSize: 17, maxWidth: 620, margin: '0 auto 28px', lineHeight: 1.7 }}>Join the institutions and researchers building a trusted map of academic knowledge — starting in Nigeria, designed for the world.</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn gold" onClick={() => onLogin('register')}>Create your Academic Passport</button>
          <button className="btn light" onClick={() => onDemo('supervisor@demo.alims')}>View supervisor demo</button>
        </div>
        <form onSubmit={async e=>{ e.preventDefault(); const em=e.target.email.value; try{ const r=await fetch('/api/waitlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em,role:e.target.role.value})}); const d=await r.json(); if(!r.ok) throw new Error(d.error); e.target.reset(); alert('You are on the pilot waitlist — position #'+d.position+'. We onboard institutions in cohorts; expect an invite email.'); }catch(err){ alert(err.message); } }} style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap',marginTop:22}} aria-label="Join the pilot waitlist">
          <input className="input" name="email" type="email" required placeholder="Work email for pilot invite" style={{maxWidth:300}} aria-label="Email for pilot waitlist"/>
          <select className="input" name="role" style={{maxWidth:210}} aria-label="Your role"><option>University leadership</option><option>Supervisor / Lecturer</option><option>Student / Researcher</option><option>Library / Registry</option><option>Company / Funder</option><option>Employer</option></select>
          <button className="btn gold">Join pilot waitlist</button>
        </form>
      </div>
    </div></section>

    {/* FOOTER */}
    <footer className="foot"><div className="container">
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 32 }} className="foot-grid">
        <div><a href="#top" aria-label="ALIMS home" style={{textDecoration:'none'}}><Logo size={40} dark /></a>
          <p style={{ lineHeight: 1.7, fontSize: 14.5, marginTop: 16, maxWidth: 340 }}>The Global Academic Knowledge Infrastructure. Preserve. Connect. Activate. Built in the open with Nigerian universities, designed to expand internationally.</p>
          <p style={{ fontSize: 13 }}>Aligned with Nigeria’s NERD policy goals & UNESCO Open Science principles.</p></div>
        <nav aria-label="Platform"><h4 style={{ color: '#fff', margin: '0 0 14px' }}>Platform</h4><p><a href="#features">Research Records</a></p><p><a href="#lineage">Academic Lineage</a></p><p><a href="#verify">Verify a certificate</a></p><p><a href="#pricing">Pricing</a></p></nav>
        <nav aria-label="Who we serve"><h4 style={{ color: '#fff', margin: '0 0 14px' }}>Who we serve</h4><p><a href="#who">Students & researchers</a></p><p><a href="#who">Supervisors</a></p><p><a href="#who">Universities & libraries</a></p><p><a href="#who">Companies & funders</a></p></nav>
        <nav aria-label="Trust"><h4 style={{ color: '#fff', margin: '0 0 14px' }}>Trust & governance</h4><p><a href="#faq">Verification, explained honestly</a></p><p><a href="#faq">Privacy & embargoes</a></p><p><a href="#faq">Disputes & corrections</a></p><p><a href="#faq">Accessibility (WCAG 2.2 AA goal)</a></p></nav>
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,.12)', marginTop: 42, paddingTop: 22, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, fontSize: 13 }}>
        <span>© 2026 ALIMS. Preserve. Connect. Activate.</span><span>An NXR-ID proves a record exists — it is not a DOI or legal title.</span>
      </div>
      <style>{`@media(max-width:860px){.foot-grid{grid-template-columns:1fr 1fr!important}}`}</style>
    </div></footer>
  </div>);
}
