import React, { useEffect, useState } from 'react';
import Icon from './icons';
import { Skeleton, Empty, Badge } from './Dashboard';

import { ops } from './api';
const fmtN = (n) => '₦' + Number(n || 0).toLocaleString();
function Bar({ v, color = 'var(--jade)' }) { return <div className="progress" role="img" aria-label={`${v}%`}><div style={{ width: v + '%', background: `repeating-linear-gradient(-45deg, ${color} 0 10px, rgba(19,17,9,.55) 10px 20px)` }} /></div>; }
function PageHead({ eyebrow, title, sub }) { return <><span className="eyebrow">{eyebrow}</span><h2 style={{ fontSize: 30, margin: '10px 0 8px' }}>{title}</h2><p style={{ color: 'var(--muted)', maxWidth: 760, lineHeight: 1.7, margin: '0 0 22px' }}>{sub}</p></>; }

/* ============ NERD Compliance (Tier S1) + Comms (S6) ============ */
export function CompliancePage({ user, records, toast }) {
  const [data, setData] = useState(null); const [comms, setComms] = useState([]); const [providers, setProviders] = useState([]);
  const [msg, setMsg] = useState({ channel: 'WhatsApp', to: '', body: '' });
  const load = () => { ops.compliance().then(setData).catch(e => toast(e.message)); ops.comms().then(setComms).catch(() => {}); ops.providers().then(setProviders).catch(() => {}); };
  useEffect(load, []);
  const verified = records.filter(r => r.verification === 'Institutionally Verified');
  return <div className="fade-in">
    <PageHead eyebrow="Tier S · Go-live rail" title="NERD Compliance & Sync" sub={<>Deposit once in ALIMS, stay compliant with the National Education Repository and Databank. Packages carry exactly what the policy requires — student, supervisor(s), HOD, institution, output type and SHA-256 hash — and <strong>nothing syncs without institutional confirmation</strong>.</>} />
    <div className="card" style={{ padding: 16, display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }} aria-label="Provider status">
      {providers.map(p => <span key={p.key} className={`badge ${p.live ? 'green' : 'amber'}`}>{p.name}: {p.live ? 'LIVE' : 'Simulation — add key to go live'}</span>)}
    </div>
    {!data ? <Skeleton /> : <div style={{ display: 'grid', gap: 14 }}>{data.institutions.filter(i => i.records > 0 || i.status === 'Verified').map(i => (
      <article key={i.id} className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}><strong style={{ fontSize: 16 }}>{i.name}</strong><span className="badge dark mono">{i.readiness}% NERD-ready</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginTop: 14 }} className="ov-grid">
          <div><Bar v={i.readiness} /><p className="hint">Overall readiness ({i.deposited}/{i.records} deposited)</p></div>
          <div><Bar v={i.metadataCompletePct} color="var(--iris)" /><p className="hint">Metadata complete {i.metadataCompletePct}% (abstract, keywords, supervisor)</p></div>
          <div><Bar v={i.supervisorCoveragePct} color="var(--sun)" /><p className="hint">Supervisor named {i.supervisorCoveragePct}% · {i.nerdSynced} synced to NERD</p></div>
        </div>
      </article>))}</div>}
    <h3 style={{ margin: '26px 0 12px' }}>Sync verified records</h3>
    {verified.length === 0 ? <Empty icon="landmark" title="No verified records yet" text="Complete a supervisor + registry workflow and verified records become syncable here." /> :
      <div style={{ display: 'grid', gap: 12 }}>{verified.map(r => <article key={r.id} className="card" style={{ padding: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 240 }}><strong style={{ fontSize: 14.5 }}>{r.title.slice(0, 80)}…</strong><div className="hint mono">{r.nxrId} · {r.institutionName}</div></div>
        {r.nerd?.synced ? <span className="badge green"><Icon name="check" size={12} /> Synced · {r.nerd.packageId}</span> :
          <button className="btn primary small" disabled={!['Department Admin', 'Librarian'].includes(user.role)} onClick={async () => { try { await ops.nerdSync(r.id); toast('Packaged for NERD. Institutional confirmation recorded; provider runs in simulation until the NERD key is configured.'); load(); } catch (e) { toast(e.message); } }}>Sync to NERD</button>}
      </article>)}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 26 }} className="ov-grid">
      <section className="card" style={{ padding: 22 }} aria-label="Send notification">
        <h3 style={{ margin: '0 0 8px' }}>Notify (Email · SMS · WhatsApp)</h3>
        <p className="hint" style={{ marginBottom: 12 }}>Supervisors respond to WhatsApp. Templates are logged to the outbox with delivery state — Termii adapter activates with a production key.</p>
        <div className="grid2"><div className="field"><label className="lbl">Channel</label><select className="input" value={msg.channel} onChange={e => setMsg({ ...msg, channel: e.target.value })}><option>WhatsApp</option><option>SMS</option><option>Email</option></select></div>
          <div className="field"><label className="lbl">Recipient</label><input className="input" value={msg.to} onChange={e => setMsg({ ...msg, to: e.target.value })} placeholder="Prof. … / +234…" /></div></div>
        <div className="field"><label className="lbl">Message</label><textarea className="input" rows={3} value={msg.body} onChange={e => setMsg({ ...msg, body: e.target.value })} placeholder="Reminder: 2 Research Records await your review in ALIMS…" /></div>
        <button className="btn primary small" onClick={async () => { try { await ops.sendComms(msg); setMsg({ ...msg, body: '', to: '' }); load(); toast('Queued and logged to the outbox.'); } catch (e) { toast(e.message); } }}>Queue message</button>
      </section>
      <section className="card" style={{ padding: 22 }} aria-label="Comms outbox">
        <h3 style={{ margin: '0 0 12px' }}>Outbox & audit</h3>
        {comms.length === 0 ? <p className="hint">Nothing sent yet.</p> : comms.slice(0, 6).map(c => <div key={c.id} style={{ borderBottom: '1px solid var(--line)', padding: '10px 0' }}>
          <span className="badge gray">{c.channel}</span> <strong style={{ fontSize: 13.5 }}>{c.to}</strong> <span className="hint">{c.at}</span>
          <p style={{ fontSize: 13.5, margin: '5px 0 2px', lineHeight: 1.6 }}>{c.body}</p><span className="hint mono">{c.status}</span></div>)}
      </section>
    </div>
  </div>;
}

/* ============ Insights (Tier A8/A9) ============ */
export function InsightsPage({ toast }) {
  const [d, setD] = useState(null); useEffect(() => { ops.insights().then(setD).catch(e => toast(e.message)); }, []);
  if (!d) return <Skeleton rows={4} />;
  return <div className="fade-in">
    <PageHead eyebrow="Tier A · Intelligence" title="Supervision & Research-Gap Intelligence" sub="Fair workload evidence for institutions and accreditation — never lecturer rankings. Gap signal = share of a field's work left incomplete or uncontinued: where departments, funders and continuation partners should look next." />
    <div className="kpi-grid" style={{ marginBottom: 20 }}>
      <div className="card kpi"><div className="n">{d.medianDaysToVerify}d</div><div className="l">Median submission → verification</div></div>
      <div className="card kpi"><div className="n">{d.supervisors.length}</div><div className="l">Active supervisors</div></div>
      <div className="card kpi"><div className="n">{d.disciplines.length}</div><div className="l">Fields mapped</div></div>
      <div className="card kpi"><div className="n">{d.disciplines.reduce((a, x) => a + x.continuation, 0)}</div><div className="l">Seeking continuation</div></div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }} className="ov-grid">
      <section className="card" style={{ padding: 22 }}><h3 style={{ margin: '0 0 14px' }}>Supervision load (evidence, not ranking)</h3>
        {d.supervisors.map(s => <div key={s.name} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}><strong style={{ fontSize: 14.5 }}>{s.name}</strong>
          <div className="hint">{s.supervised} supervised · {s.verified} verified · {s.pending} pending review</div><Bar v={s.supervised ? Math.round(s.verified / s.supervised * 100) : 0} /></div>)}
        <p className="trace">{d.note}</p></section>
      <section className="card" style={{ padding: 22 }}><h3 style={{ margin: '0 0 14px' }}>Research-gap heatmap by field</h3>
        {d.disciplines.map(x => <div key={x.discipline} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong style={{ fontSize: 14.5 }}>{x.discipline}</strong><span className={`badge ${x.gapSignal > 40 ? 'red' : x.gapSignal > 15 ? 'amber' : 'green'}`}>{x.gapSignal}% gap</span></div>
          <div className="hint">{x.total} records · {x.verified} verified · {x.continuation} seeking continuation</div><Bar v={x.gapSignal} color="var(--seal)" /></div>)}
      </section>
    </div>
  </div>;
}

/* ============ Digitisation Studio (Tier A12) ============ */
const SAMPLE = `{"title":"Student Cooperative Movements in Western Nigeria, 1968-1978","year":"1978","provenance":"History Dept strong-room, Box 14","confidence":"medium"}
{"title":"Soil Fertility Trials at Moor Plantation, Ibadan (1965)","year":"1965","provenance":"Agric Library basement archive","confidence":"low"}`;
export function StudioPage({ user, toast, go }) {
  const [text, setText] = useState(SAMPLE); const [busy, setBusy] = useState(false);
  const run = async () => {
    let items; try { items = text.split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { toast('Each line must be valid JSON with at least a title. Fix the highlighted batch and retry — nothing was imported.'); return; }
    setBusy(true); try { const d = await ops.bulkImport(items); toast(`Imported ${d.created} historical records with provenance labels. Original-author verification is marked unavailable where true — never invented.`); go('discover'); } catch (e) { toast(e.message); } setBusy(false);
  };
  return <div className="fade-in">
    <PageHead eyebrow="Tier A · Preservation" title="Digitisation Studio" sub={<>For librarians bringing the back-catalogue (NERD's ambition reaches back to 1932) into the atlas. Every import carries <strong>source, digitizer and confidence</strong>, and states plainly when original student/supervisor verification is unavailable. Paste one JSON object per line:</>} />
    <div className="card" style={{ padding: 22 }}>
      <label className="lbl" htmlFor="bulk">Batch import (title, year, provenance, confidence per line)</label>
      <textarea id="bulk" className="input mono" rows={7} value={text} onChange={e => setText(e.target.value)} style={{ fontSize: 13 }} />
      <p className="hint">Requires Librarian or Department Admin role. Records land as Historical Digitisation with the provenance above attached — claim flows let original authors attach later with evidence.</p>
      <button className="btn primary" disabled={busy} onClick={run}>{busy ? 'Importing…' : 'Import batch with provenance'}</button>
    </div>
  </div>;
}

/* ============ Developer & API (Tier B15) + Credential viewer ============ */
export function DeveloperPage({ toast }) {
  const [keys, setKeys] = useState([]); const [name, setName] = useState('Employer verify integration'); const [fresh, setFresh] = useState(null); const [credId, setCredId] = useState('r1'); const [cred, setCred] = useState(null);
  const load = () => ops.keys().then(setKeys).catch(e => toast(e.message)); useEffect(load, []);
  return <div className="fade-in">
    <PageHead eyebrow="Tier B · Ecosystem" title="Developer & Public API" sub="Employers, careers offices and LMS integrations verify through keys — rate-limited, scoped, revocable. Full key shown once at creation; only previews are stored in this list." />
    <section className="card" style={{ padding: 22, marginBottom: 18 }}>
      <h3 style={{ margin: '0 0 12px' }}>API keys</h3>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}><input className="input" style={{ flex: 1, minWidth: 220 }} value={name} onChange={e => setName(e.target.value)} aria-label="Key name" />
        <button className="btn primary small" onClick={async () => { try { const k = await ops.createKey(name); setFresh(k); load(); } catch (e) { toast(e.message); } }}>Create key</button></div>
      {fresh && <div style={{ background: 'var(--amber-bg)', borderRadius: 12, padding: 14, marginBottom: 14 }}><strong>Copy this key now — it will not be shown again:</strong><div className="mono" style={{ wordBreak: 'break-all', marginTop: 6, fontSize: 13 }}>{fresh.key}</div></div>}
      {keys.map(k => <div key={k.id} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid var(--line)' }}>
        <div style={{ flex: 1, minWidth: 220 }}><strong style={{ fontSize: 14.5 }}>{k.name}</strong><div className="hint mono">{k.keyPreview} · scopes {(k.scopes || []).join(', ')} · created {k.created} · last used {k.lastUsed}</div></div>
        <span className={`badge ${k.active ? 'green' : 'red'}`}>{k.active ? 'Active' : 'Revoked'}</span>
        {k.active && <button className="btn ghost small" onClick={async () => { await ops.revokeKey(k.id); load(); toast('Key revoked. Integrations using it receive 401 immediately.'); }}>Revoke</button>}</div>)}
      <pre className="mono" style={{ background: '#12100A', color: '#F2B33D', borderRadius: 12, padding: 16, fontSize: 12.5, overflowX: 'auto', marginTop: 16 }}>{`GET /api/public/v1/verify/NXR-2025-01041
Headers: X-ALIMS-Key: alims_live_…

→ { "status": "Valid", "nxrId": "NXR-2025-01041", … }
Embed: <a href="https://alims.example/verify/NXR-…">
  <img src="https://alims.example/badge/NXR-….svg" alt="Verified on ALIMS"/>
</a>`}</pre>
    </section>
    <section className="card" style={{ padding: 22 }}>
      <h3 style={{ margin: '0 0 8px' }}>Verifiable Credential (W3C VC · Open Badges 3.0)</h3>
      <p className="hint">The same certificate, machine-readable for wallets and employer systems. It evidences the verification workflow for that version only — never legal ownership or a degree.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><input className="input" style={{ maxWidth: 200 }} value={credId} onChange={e => setCredId(e.target.value)} aria-label="Record ID" placeholder="record id (r1)" />
        <button className="btn gold small" onClick={async () => { try { setCred(await ops.credential(credId)); } catch (e) { toast(e.message); } }}>Issue credential JSON</button></div>
      {cred && <pre className="mono" style={{ background: '#12100A', color: '#CDEEDB', borderRadius: 12, padding: 16, fontSize: 12, overflowX: 'auto', marginTop: 14, maxHeight: 340, overflowY: 'auto' }}>{JSON.stringify(cred, null, 2)}</pre>}
    </section>
  </div>;
}

/* ============ Billing (Tier S7) ============ */
export function BillingPage({ toast }) {
  const [b, setB] = useState(null); const load = () => ops.billing().then(setB).catch(e => toast(e.message)); useEffect(load, []);
  if (!b) return <Skeleton rows={3} />;
  return <div className="fade-in">
    <PageHead eyebrow="Tier S · Monetisation" title="Billing & Plans" sub={<>Institutions fund the infrastructure; students and researchers stay free. Provider: <strong>{b.provider?.name}</strong> — {b.provider?.mode}. Invoices, seat usage and verification packs in one ledger.</>} />
    <div className="price-grid" style={{ marginTop: 6 }}>
      {(b.plans || []).map(pl => <div key={pl.name} className={`price ${b.plan === pl.name ? 'hot' : ''}`}>
        {b.plan === pl.name && <span className="badge green" style={{ position: 'absolute', top: -12, right: 18 }}>Current plan</span>}
        <h3 style={{ fontSize: 20, margin: 0 }}>{pl.name}</h3><p className="hint">{pl.per}</p>
        <div style={{ fontFamily: 'Fraunces,serif', fontSize: 32, margin: '12px 0' }}>{pl.price ? fmtN(pl.price) : 'Custom'}</div>
        {pl.price ? <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={async () => { try { setB(await ops.checkout(pl.name)); toast(`Subscribed to ${pl.name}. Receipt recorded in the ledger below.`); } catch (e) { toast(e.message); } }}>{b.plan === pl.name ? 'Renew / upgrade' : 'Subscribe'}</button> : <button className="btn ghost" style={{ width: '100%', justifyContent: 'center' }}>Talk to our team</button>}
      </div>)}
    </div>
    <section className="card" style={{ padding: 22, marginTop: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}><h3 style={{ margin: 0 }}>Ledger — {b.institution || 'Your institution'}</h3><span className="badge dark mono">{b.used || 0}/{b.seats || 0} seats · renews {b.renews || '—'}</span></div>
      <div style={{ marginTop: 12 }}><Bar v={b.seats ? Math.round((b.used || 0) / b.seats * 100) : 0} /></div>
      {(b.transactions || []).map(tx => <div key={tx.id} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '12px 0', borderBottom: '1px solid var(--line)', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 220 }}><strong style={{ fontSize: 14.5 }}>{tx.label}</strong><div className="hint mono">{tx.ref} · {tx.date}</div></div>
        <strong className="mono">{fmtN(tx.amount)}</strong><span className="badge green">{tx.status}</span></div>)}
    </section>
  </div>;
}
