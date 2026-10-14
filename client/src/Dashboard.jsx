import React, { useEffect, useMemo, useState } from 'react';
import { api, VERIFY_STYLES, ops } from './api';
import Icon from './icons';

export const Badge = ({ v }) => <span className={`badge ${VERIFY_STYLES[v] || 'gray'}`}>{v === 'Institutionally Verified' && <Icon name="badge-check" size={12}/>} {v}</span>;
export const AccessBadge = ({ v }) => <span className="badge gray"><Icon name="lock" size={12}/> {v}</span>;
const initials = (n='') => n.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase();

export function Skeleton({ rows = 3 }) { return <div style={{ display:'grid', gap:14 }}>{Array.from({length:rows}).map((_,i)=><div key={i} className="skel" style={{height:96}}/>)}</div>; }
export function Empty({ icon='inbox', title, text, action }) { return <div className="card empty"><div className="empty-ic" aria-hidden="true"><Icon name={icon} size={28}/></div><h3 style={{margin:'0 0 8px',fontSize:20}}>{title}</h3><p style={{color:'var(--muted)',maxWidth:440,margin:'0 auto 18px',lineHeight:1.65}}>{text}</p>{action}</div>; }

/* ---------------- Overview ---------------- */
function Overview({ user, go, toast }) {
  const [stats,setStats]=useState(null); const [mine,setMine]=useState([]); const [sugg,setSugg]=useState([]); const [dismissed,setDismissed]=useState([]);
  useEffect(()=>{ api.stats().then(setStats).catch(()=>{}); api.records('?ownerId='+user.id).then(setMine).catch(()=>{}); api.suggestions().then(setSugg).catch(()=>{}); },[user.id]);
  const pending = mine.filter(r=>['Submitted','In Review','Returned for Revision'].includes(r.status)).length;
  return <div className="fade-in">
    <div style={{background:'linear-gradient(140deg,#FFF3CF,#CDEEDB 135%)',border:'1.5px solid #111111',boxShadow:'5px 5px 0 #111111',borderRadius:14,padding:'30px 30px 26px',color:'#111111',marginBottom:22,position:'relative',overflow:'hidden'}}>
      <span className="badge dark">● {user.role.toUpperCase()} · {user.institutionId? 'INSTITUTION-LINKED':'INDEPENDENT'}</span>
      <h2 style={{fontSize:30,margin:'14px 0 8px'}}>Good to see you, {user.name.split(' ')[0]}.</h2>
      <p style={{color:'#3F3D36',maxWidth:640,lineHeight:1.65,margin:0}}>Your knowledge is preserved, your contributions are evidenced, and your next connection is closer than you think. <strong>Preserve. Connect. Activate.</strong></p>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:18}}>
        <button className="btn gold small" onClick={()=>go('records:new')}>+ New Research Record</button>
        <button className="btn ghost small" style={{background:'#fff'}} onClick={()=>go('discover')}>Discover research</button>
        <button className="btn ghost small" style={{background:'#fff'}} onClick={()=>go('opportunities:new')}>Post an opportunity</button>
      </div>
    </div>
    {!stats ? <Skeleton rows={1}/> : <div className="kpi-grid" style={{marginBottom:22}}>
      {[['Research Records (network)',stats.records],['Institutionally Verified',stats.verified],['Your records',mine.length],['Awaiting action',pending],['Open opportunities',stats.opportunities],['Certificates issued',stats.certificates],['Under embargo',stats.embargoed],['Seeking continuation',stats.seekingContinuation]].slice(0,4).map(([l,n])=>(
      <div key={l} className="card kpi"><div className="n">{n}</div><div className="l">{l}</div></div>))}
    </div>}
    <div style={{display:'grid',gridTemplateColumns:'1.35fr 1fr',gap:18}} className="ov-grid">
      <section className="card" style={{padding:24}} aria-label="Your recent records">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}><h3 style={{margin:0,fontSize:19}}>Your recent records</h3><button className="btn ghost small" onClick={()=>go('records')}>View all</button></div>
        {mine.length===0 ? <p style={{color:'var(--muted)',lineHeight:1.7}}>No records yet. Create your first Research Record — you can save a draft with just a title and finish later.</p> :
        <div style={{display:'grid',gap:12,marginTop:16}}>{mine.slice(0,3).map(r=><RecordRow key={r.id} r={r} go={go}/>)}</div>}
      </section>
      <section className="card" style={{padding:24}} aria-label="Explainable suggestions">
        <h3 style={{margin:'0 0 6px',fontSize:19}}>Suggested for you</h3>
        <p style={{fontSize:13,color:'var(--muted)',lineHeight:1.6,margin:'0 0 14px'}}>Suggestions explain their basis and are <strong>never shown publicly as fact</strong> until you accept them.</p>
        {sugg.filter(s=>!dismissed.includes(s.id)).map(s=><div key={s.id} style={{border:'1px solid var(--line)',borderRadius:14,padding:14,marginBottom:12}}>
          <strong style={{fontSize:14.5,lineHeight:1.5,display:'block'}}>{s.title}</strong>
          <p style={{fontSize:13.5,color:'var(--muted)',lineHeight:1.65,margin:'7px 0'}}>{s.why}</p>
          <span className="badge amber">{s.confidence}</span>
          <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}>
            <button className="btn primary small" onClick={()=>{ setDismissed(d=>[...d,s.id]); go('record:'+s.recordId); }}>Explore</button>
            <button className="btn ghost small" onClick={()=> setDismissed(d=>[...d,s.id])}>Dismiss</button>
          </div></div>)}
        {sugg.filter(s=>!dismissed.includes(s.id)).length===0 && <p style={{color:'var(--muted)',fontSize:14}}>All caught up. New suggestions appear as related work is deposited.</p>}
      </section>
    </div>
  </div>;
}

export function RecordRow({ r, go }) {
  return <article className="card rec-card" onClick={()=>go('record:'+r.id)} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')go('record:'+r.id)}} aria-label={r.title}>
    <div style={{flex:1,minWidth:0}}>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:8}}><Badge v={r.verification}/><AccessBadge v={r.access}/>{r.seekingContinuation && <span className="badge amber"><Icon name="sprout" size={12}/> Seeking continuation</span>}</div>
      <h4 style={{margin:'0 0 6px',fontSize:16.5,lineHeight:1.45}}>{r.title}</h4>
      <p style={{margin:0,fontSize:13.5,color:'var(--muted)'}}>{r.nxrId} · {r.institutionName} · {r.type} · {r.year} · {r.ownerName}</p>
    </div>
    <div className="rec-meta"><div className="rec-stat"><Icon name="eye" size={14}/>{(r.views||0).toLocaleString()}</div><div className="rec-stat"><Icon name="bookmark" size={14}/>{(r.saves||0)}</div></div>
  </article>;
}

/* ---------------- Records list + CRUD ---------------- */
const EMPTY_REC = { title:'', type:'Final-Year Project', discipline:'Artificial Intelligence', abstract:'', keywords:'', access:'Abstract public', licence:'CC BY 4.0 (abstract & metadata); full text by request', methodology:'', researchQuestion:'', embargoUntil:'', institutionId:'', department:'', seekingContinuation:false, completion:'In progress', datasetAvailable:false, codeAvailable:false };

export function RecordForm({ initial, institutions, user, onSave, onCancel, saving }) {
  const [f,setF]=useState(initial||EMPTY_REC); const set=(k,v)=>setF(s=>({...s,[k]:v}));
  return <form onSubmit={e=>{e.preventDefault(); onSave({...f, keywords:String(f.keywords).split(',').map(s=>s.trim()).filter(Boolean).slice(0,20)});}}>
    <div className="field"><label className="lbl" htmlFor="rf-title">Title * <span style={{fontWeight:500,color:'var(--muted)'}}>(10–500 characters · public where permitted)</span></label>
      <input id="rf-title" className="input" required minLength={10} maxLength={500} value={f.title} onChange={e=>set('title',e.target.value)} placeholder="e.g. Offline-First Cassava Disease Detection with Yoruba Voice Guidance"/></div>
    <div className="grid2">
      <div className="field"><label className="lbl">Output type *</label><select className="input" value={f.type} onChange={e=>set('type',e.target.value)}>
        {['Final-Year Project','Undergraduate Thesis','MSc Dissertation','PhD Thesis','Journal Article','Dataset','Software / Code','Report','Patent Disclosure','Historical Digitisation'].map(t=><option key={t}>{t}</option>)}</select></div>
      <div className="field"><label className="lbl">Discipline / field *</label><select className="input" value={f.discipline} onChange={e=>set('discipline',e.target.value)}>
        {['Artificial Intelligence','Agriculture Technology','Public Health','Energy Systems','Food Science','Agronomy','Environmental Studies','History & Archives','Computer Science','Multidisciplinary'].map(t=><option key={t}>{t}</option>)}</select></div>
    </div>
    <div className="field"><label className="lbl">Abstract <span style={{fontWeight:500,color:'var(--muted)'}}>(required ≥100 characters to submit · visibility follows access choice)</span></label>
      <textarea className="input" rows={5} value={f.abstract} onChange={e=>set('abstract',e.target.value)} placeholder="What problem, what approach, what evidence, what finding?"/>
      <p className="hint">{(f.abstract||'').length}/10,000 characters · Explain terms plainly — many readers will be outside your field.</p></div>
    <div className="grid2">
      <div className="field"><label className="lbl">Keywords (comma-separated, 1–20)</label><input className="input" value={Array.isArray(f.keywords)?f.keywords.join(', '):f.keywords} onChange={e=>set('keywords',e.target.value)} placeholder="cassava, offline AI, Yoruba NLP"/></div>
      <div className="field"><label className="lbl">Institution (leave empty for independent work)</label><select className="input" value={f.institutionId||''} onChange={e=>set('institutionId',e.target.value)}>
        <option value="">Independent — no institutional affiliation</option>{institutions.filter(i=>i.status==='Verified').map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select>
        <p className="hint">Independent records are honestly labelled Self-Published / Identity-Verified Deposit. Only a completed institutional workflow can ever show “Institutionally Verified”.</p></div>
    </div>
    <div className="grid2">
      <div className="field"><label className="lbl">Access choice *</label><select className="input" value={f.access} onChange={e=>set('access',e.target.value)}>
        {['Metadata public','Abstract public','Full public','Institution only','Restricted'].map(t=><option key={t}>{t}</option>)}</select>
        <p className="hint">Metadata visibility ≠ document visibility. You can be discoverable while your full text stays protected.</p></div>
      <div className="field"><label className="lbl">Embargo until (optional)</label><input type="date" className="input" value={f.embargoUntil||''} onChange={e=>set('embargoUntil',e.target.value||null)}/>
        <p className="hint">Use for patentable, sponsor-sensitive or journal-embargoed work. You’ll be notified before any planned access change.</p></div>
    </div>
    <div className="grid2">
      <div className="field"><label className="lbl">Research question</label><input className="input" value={f.researchQuestion} onChange={e=>set('researchQuestion',e.target.value)} placeholder="The question this work answers"/></div>
      <div className="field"><label className="lbl">Methodology</label><input className="input" value={f.methodology} onChange={e=>set('methodology',e.target.value)} placeholder="e.g. Field pilot (n=42) · Design science"/></div>
    </div>
    <div className="field"><label className="lbl">Licence / rights statement *</label><input className="input" required value={f.licence} onChange={e=>set('licence',e.target.value)}/></div>
    <label style={{display:'flex',gap:10,alignItems:'flex-start',fontSize:14.5,marginBottom:10}}><input type="checkbox" checked={f.seekingContinuation} onChange={e=>set('seekingContinuation',e.target.checked)} style={{marginTop:3}}/> <span><strong>Incomplete — Seeking Continuation.</strong> Invite collaborators to continue this work under a collaboration charter (roles, confidentiality, credit & IP agreed before private material is shared).</span></label>
    <label style={{display:'flex',gap:10,alignItems:'center',fontSize:14.5,marginBottom:18}}><input type="checkbox" checked={f.datasetAvailable} onChange={e=>set('datasetAvailable',e.target.checked)}/> Dataset available &nbsp; <input type="checkbox" checked={f.codeAvailable} onChange={e=>set('codeAvailable',e.target.checked)}/> Code / software available</label>
    <div style={{display:'flex',gap:10,justifyContent:'flex-end',flexWrap:'wrap'}}><button type="button" className="btn ghost" onClick={onCancel}>Cancel</button><button className="btn primary" disabled={saving}>{saving?'Saving…':'Save Research Record'}</button></div>
  </form>;
}

function RecordsPage({ user, go, toast }) {
  const [list,setList]=useState(null); const [q,setQ]=useState(''); const [filter,setFilter]=useState('All'); const [showForm,setShowForm]=useState(go._newRecord||false); const [edit,setEdit]=useState(null); const [saving,setSaving]=useState(false); const [inst,setInst]=useState([]);
  const load=()=>api.records('?ownerId='+user.id).then(setList).catch(e=>toast(e.message));
  useEffect(()=>{ load(); api.institutions().then(setInst).catch(()=>{}); },[]);
  const save=async(body)=>{ setSaving(true); try{ if(edit){ await api.updateRecord(edit.id,body); toast('Record updated. Verified versions are never overwritten — edits apply to drafts/returned records only.'); } else { const r=await api.createRecord(body); toast(`Draft created with deposit ID ${r.nxrId}. Complete the abstract (≥100 chars) when you’re ready to submit.`);} setShowForm(false); setEdit(null); load(); }catch(e){ toast(e.message);} setSaving(false); };
  const del=async(r)=>{ if(!confirm(`Delete “${r.title}”? This removes the draft record. Verified records cannot be deleted — they follow institutional withdrawal instead.`))return;
    const prev=list; setList(list.filter(x=>x.id!==r.id)); /* optimistic */ try{ await api.deleteRecord(r.id); toast('Record deleted.'); }catch(e){ setList(prev); toast(e.message); } };
  const shown=(list||[]).filter(r=> (filter==='All'||r.status===filter) && (r.title+r.abstract+r.nxrId).toLowerCase().includes(q.toLowerCase()));
  return <div className="fade-in">
    <div style={{display:'flex',justifyContent:'space-between',gap:14,flexWrap:'wrap',alignItems:'center',marginBottom:18}}>
      <div><h2 style={{fontSize:28,margin:'0 0 6px'}}>My Research Records</h2><p style={{color:'var(--muted)',margin:0}}>Drafts are private. Submitted versions are never overwritten — revisions become new versions.</p></div>
      <button className="btn primary" onClick={()=>{setEdit(null);setShowForm(true)}}>+ New Research Record</button>
    </div>
    <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:16}}>
      <input className="input" style={{maxWidth:340}} placeholder="Search your records…" value={q} onChange={e=>setQ(e.target.value)} aria-label="Search your records"/>
      <div className="tabs">{['All','Draft','Submitted','In Review','Returned for Revision','Institutionally Verified','Self-Published'].map(t=><button key={t} className={`tab ${filter===t?'active':''}`} onClick={()=>setFilter(t)}>{t}</button>)}</div>
    </div>
    {!list ? <Skeleton/> : shown.length===0 ? <Empty icon="sprout" title="Nothing here yet" text="Records you create will live here — preserved beyond graduation, versioned, and verifiable. Start with just a title; you can save a draft and complete it later." action={<button className="btn primary" onClick={()=>setShowForm(true)}>Create your first record</button>}/> :
    <div style={{display:'grid',gap:14}}>{shown.map(r=><div key={r.id} style={{position:'relative'}}><RecordRow r={r} go={go}/>
      {(r.ownerId===user.id && ['Draft','Returned for Revision'].includes(r.status)) && <div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}}>
        <button className="btn ghost small" onClick={()=>{setEdit(r);setShowForm(true)}}>Edit draft</button>
        <button className="btn ghost small" style={{color:'var(--red)'}} onClick={()=>del(r)}>Delete</button></div>}</div>)}</div>}
    {showForm && <div className="modal-bg" onClick={()=>setShowForm(false)}><div className="modal" onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Research Record form">
      <h3 style={{fontSize:24,margin:'0 0 6px'}}>{edit?'Edit Research Record':'New Research Record'}</h3>
      <p style={{color:'var(--muted)',fontSize:14,lineHeight:1.6}}>Fields explain whether they’ll be public, institutional-only or private. Save a draft anytime — submit only when required fields are complete.</p>
      <RecordForm initial={edit} institutions={inst} user={user} saving={saving} onCancel={()=>setShowForm(false)} onSave={save}/></div></div>}
  </div>;
}

/* ---------------- Record detail ---------------- */
function RecordDetail({ id, user, go, toast }) {
  const [r,setR]=useState(null); const [err,setErr]=useState(''); const [busy,setBusy]=useState(false);
  const [review,setReview]=useState(null); const [reason,setReason]=useState('');
  const [accessMsg,setAccessMsg]=useState(''); const [showAccess,setShowAccess]=useState(false);
  const [saved,setSaved]=useState(false); const [lang,setLang]=useState('en'); const [abs,setAbs]=useState(null); const [enrich,setEnrich]=useState(null);
  const load=()=>api.record(id).then(setR).catch(e=>setErr(e.message));
  useEffect(()=>{ load(); ops.enrich(id).then(setEnrich).catch(()=>{}); },[id]);
  if(err) return <Empty icon="lock" title="This record isn’t available to you" text={err+" Restricted records never expose titles, abstracts, files or review notes to unauthorised viewers."} action={<button className="btn primary" onClick={()=>go('discover')}>Back to discovery</button>}/>;
  if(!r) return <Skeleton rows={4}/>;
  const isOwner=r.ownerId===user.id; const isReviewer=['Supervisor','Department Admin','Librarian'].includes(user.role);
  const act=async(fn,msg)=>{ setBusy(true); try{ const nr=await fn(); setR(nr); toast(msg); }catch(e){ toast(e.message);} setBusy(false); };
  const certUrl = r.certificate ? `${location.origin}${location.pathname}#/verify/${r.certificate.id}` : '';
  return <div className="fade-in">
    <button className="btn ghost small" onClick={()=>go('discover')}>← Back</button>
    <div className="card" style={{padding:30,marginTop:14}}>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}><Badge v={r.verification}/><AccessBadge v={r.access}/>{r.embargoUntil && <span className="badge amber">⏳ Full text embargoed until {r.embargoUntil}</span>}{r.seekingContinuation && <span className="badge amber"><Icon name="sprout" size={12}/> Seeking continuation</span>}{r.nerd?.synced && <span className="badge dark mono">NERD synced · {r.nerd.packageId}</span>}{r.datasetAvailable && <span className="badge green">Dataset available</span>}{r.codeAvailable && <span className="badge green">Code available</span>}</div>
      <h2 style={{fontSize:30,lineHeight:1.3,margin:'0 0 10px'}}>{r.title}</h2>
      <p style={{color:'var(--muted)',margin:'0 0 4px'}}><strong style={{color:'var(--ink)'}}>{r.nxrId}</strong> · {r.type} · {r.institutionName}{r.department?' · '+r.department:''} · {r.year}{r.session?' · '+r.session:''}</p>
      <p style={{color:'var(--muted)',margin:0}}>Lead researcher: <strong style={{color:'var(--ink)'}}>{r.ownerName}</strong>{r.supervisorName && <> · Supervisor: {r.supervisorName} <span className="badge teal">Supervision ≠ authorship</span></>}</p>
      <div style={{marginTop:14}}>{(r.keywords||[]).map(k=><span key={k} className="chip">{k}</span>)}</div>
      <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',margin:'22px 0 8px'}}><h3 style={{margin:0}}>Abstract</h3>
      <select className="input" style={{width:190,padding:'7px 12px'}} value={lang} aria-label="Abstract language" onChange={async e=>{ const l=e.target.value; setLang(l); if(l==='en'){ setAbs(null); } else { const d=await ops.abstract(r.id,l); setAbs(d); } }}>
        <option value="en">English (original)</option><option value="fr">Français</option><option value="ha">Hausa</option><option value="yo">Yorùbá</option><option value="ig">Igbo</option></select>
      {abs && <span className="badge amber">{abs.source}</span>}</div>
      <p style={{lineHeight:1.8,color:'var(--ink2)'}}>{abs ? abs.abstract : r.abstract}</p>
      {enrich && <p className="trace">Crossref: {enrich.crossref.status}{enrich.crossref.doi ? ' · DOI '+enrich.crossref.doi : ''} · OpenAlex concepts: {(enrich.openAlex.concepts||[]).join(', ')} · {enrich.note}</p>}
      {r.researchQuestion && <><h3 style={{margin:'20px 0 8px'}}>Research question</h3><p style={{lineHeight:1.75,color:'var(--ink2)'}}>{r.researchQuestion}</p></>}
      {r.methodology && <><h3 style={{margin:'20px 0 8px'}}>Methodology</h3><p style={{lineHeight:1.75,color:'var(--ink2)'}}>{r.methodology}</p></>}
      <p style={{fontSize:13.5,color:'var(--muted)'}}>Licence / rights: {r.licence} · {(r.views||0).toLocaleString()} views · {(r.saves||0)} saves</p>

      <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:18}}>
        <button className={`btn ${saved?'ghost':'primary'} small`} onClick={()=>{ setSaved(!saved); toast(saved?'Removed from your saved list.':'Saved. Find it anytime under Discover → Saved.'); }}>{saved?<><Icon name="bookmark" size={14}/> Saved</>:<><Icon name="bookmark" size={14}/> Save record</>}</button>
        {!isOwner && <button className="btn gold small" onClick={()=>setShowAccess(true)}>Request access / introduction</button>}
        <button className="btn ghost small" onClick={()=>go('verify:'+(r.certificate?.id||r.nxrId))}>Verify this record</button>
        {isOwner && ['Draft','Returned for Revision'].includes(r.status) && <button className="btn primary small" disabled={busy} onClick={()=>act(()=>api.submitRecord(r.id,'Submitted via ALIMS workflow.'), r.institutionId? 'Submitted. Your supervisor now has a review task — this is not yet verified, and ALIMS says so honestly.':'Published as Identity-Verified Deposit with timestamped deposit evidence. It is not institutionally verified.')}>{r.institutionId?'Submit for institutional review':'Publish as self-published deposit'}</button>}
        {isOwner && r.seekingContinuation && <button className="btn ghost small" onClick={()=>go('opportunities:new')}>Create continuation opportunity</button>}
        {r.certificate && <button className="btn ghost small" onClick={async()=>{ try{ const c=await ops.credential(r.id); const blob=new Blob([JSON.stringify(c,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=r.certificate.id+'-credential.json'; a.click(); toast('W3C Verifiable Credential (Open Badges 3.0 shape) downloaded for wallets and employer systems.'); }catch(e){ toast(e.message); } }}><Icon name="id-card" size={14}/> Credential JSON</button>}
        {isReviewer && <button className="btn ghost small" disabled={busy} onClick={()=>act(()=>ops.runSimilarity(r.id),'Similarity queued and completed as a PRIVATE signal. Now record your human decision below — the signal alone decides nothing.')}><Icon name="shield-check" size={14}/> Run similarity check</button>}
        {isOwner && <label className="btn ghost small" style={{cursor:'pointer'}}><Icon name="archive" size={14}/> Attach file<input type="file" hidden onChange={async e=>{ const f=e.target.files[0]; if(!f) return; const fd=new FormData(); try{ const d=await ops.addFile(r.id,{name:f.name,size:f.size,type:f.type}); setR(d.record); toast('File received. SHA-256 deposit evidence recorded: '+d.file.sha256.slice(0,16)+'… Antivirus gate: '+d.file.avScan); }catch(err){ toast(err.message); } }}/></label>}
      </div>
      {r.lastReview && <div style={{background:'var(--amber-bg)',borderRadius:12,padding:'12px 14px',fontSize:14,marginTop:16}}><strong>Latest reviewer decision</strong> — {r.lastReview.by} ({r.lastReview.role}): “{r.lastReview.reason}”</div>}

      {isReviewer && ['Submitted','In Review','Returned for Revision'].includes(r.status) && <div style={{border:'1.5px dashed var(--amber)',background:'#FFF6D8',borderRadius:16,padding:18,marginTop:20}}>
        <h3 style={{margin:'0 0 6px'}}>Reviewer decision (human, recorded, auditable)</h3>
        <p style={{fontSize:13.5,color:'var(--muted)',lineHeight:1.6,margin:'0 0 12px'}}>Similarity status: <strong>{r.similarity?.status}</strong>. {r.similarity?.note} A similarity signal alone never rejects, labels or accuses — you must choose an outcome and give a reason.</p>
        <textarea className="input" rows={2} placeholder="Record your reason (required)…" value={reason} onChange={e=>setReason(e.target.value)}/>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}>
          <button className="btn ghost small" disabled={busy} onClick={()=>act(()=>api.reviewRecord(r.id,'supervisor-approve',reason),'Supervisor attestation recorded. Status: Supervisor-Verified — not yet institutionally verified.')}>Confirm supervision</button>
          <button className="btn ghost small" disabled={busy} onClick={()=>act(()=>api.reviewRecord(r.id,'return',reason),'Returned for revision. The submitted version stays in history; the student will resubmit as a new version.')}>Return for revision</button>
          {(user.role==='Department Admin'||user.role==='Librarian') && <button className="btn primary small" disabled={busy} onClick={()=>act(()=>api.reviewRecord(r.id,'verify',reason),'Institutionally Verified. NXR-ID confirmed and QR certificate issued.')}>Complete institutional verification</button>}
        </div></div>}
    </div>

    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18,marginTop:18}} className="ov-grid">
      <section className="card" style={{padding:24}}><h3 style={{margin:'0 0 16px'}}>Version history</h3>
        {(r.files||[]).length>0 && <div style={{marginBottom:16}}><h4 style={{margin:'0 0 8px',fontSize:15}}>File deposit evidence</h4>{r.files.map(f=><div key={f.id} style={{fontSize:13,padding:'8px 0',borderBottom:'1px solid var(--line)'}}><strong>{f.name}</strong> <span className="hint mono">{(f.size/1024).toFixed(1)} KB · SHA-256 {f.sha256.slice(0,16)}…</span><div className="hint">{f.depositEvidence}</div><span className="badge green">{f.avScan}</span></div>)}</div>}
        {(r.versions||[]).length===0 ? <p style={{color:'var(--muted)',fontSize:14,lineHeight:1.7}}>No submitted versions yet. When you submit, each version is preserved — approved versions are never overwritten.</p> :
        <div className="timeline">{[...r.versions].reverse().map((v,i)=><div key={i}><strong style={{fontSize:14.5}}>{v.label}</strong><div style={{fontSize:13,color:'var(--muted)'}}>{v.date} · {v.state}</div><p style={{fontSize:14,color:'var(--ink2)',margin:'4px 0 0',lineHeight:1.6}}>{v.note}</p></div>)}</div>}
      </section>
      <section className="card" style={{padding:24}}><h3 style={{margin:'0 0 6px'}}>Contribution Ledger</h3>
        <p style={{fontSize:13,color:'var(--muted)',lineHeight:1.6}}>CRediT roles · Lead / Equal / Supporting. Rank never auto-generates credit. Disputes stay private to authorised parties until resolved.</p>
        {(r.contributors||[]).map((c,i)=><div key={i} style={{display:'flex',gap:12,alignItems:'flex-start',flexWrap:'wrap',padding:'12px 0',borderBottom:'1px solid var(--line)'}}>
          <span className="avatar">{initials(c.name)}</span><div style={{flex:1}}><strong style={{fontSize:14.5}}>{c.name}</strong> <span className={`badge ${c.status==='Disputed'?'red':c.status==='Acknowledged'?'green':'amber'}`}>{c.status}</span>
          <div style={{fontSize:13,color:'var(--muted)',marginTop:3}}>{(c.roles||[]).join(' · ')} — {c.level}</div></div>
          {c.name===user.name && c.status!=='Acknowledged' && <div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button className="btn primary small" onClick={()=>act(()=>api.respondContributor(r.id,c.name,'acknowledge'),'Contribution acknowledged and recorded in the ledger.')}>Acknowledge</button><button className="btn ghost small" onClick={()=>act(()=>api.respondContributor(r.id,c.name,'dispute','Contributor disputes the declared role/level.'),'Marked Disputed and routed privately to the institutional dispute process. You have not been removed.')}>Dispute</button></div>}
        </div>)}
        {r.certificate && <div style={{marginTop:18,background:'var(--mint)',borderRadius:14,padding:16,display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
          <div className="qrbox" aria-hidden="true"><span>ALIMS <Icon name="check" size={11}/></span></div>
          <div style={{fontSize:13.5,lineHeight:1.65}}><strong className="mono">Certificate {r.certificate.id}</strong> {r.certificate.status==='Valid' && <span className="stamp" style={{marginLeft:8}}><Icon name="badge-check" size={13}/> Valid</span>} · <span className={`badge ${r.certificate.status==='Valid'?'green':'amber'}`}>{r.certificate.status}</span><br/>Issued {r.certificate.issuedAt} · Anyone can verify at <button className="btn ghost small" onClick={()=>go('verify:'+r.certificate.id)}>Verify page</button><br/><span style={{color:'var(--muted)'}}>The QR resolves only to public verification status — no sensitive data is embedded in it.</span></div></div>}
      </section>
    </div>

    {showAccess && <div className="modal-bg" onClick={()=>setShowAccess(false)}><div className="modal" onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Request access">
      <h3 style={{fontSize:23,margin:'0 0 8px'}}>Request access / introduction</h3>
      <p style={{color:'var(--muted)',fontSize:14,lineHeight:1.65}}>The owner (and institution, where configured) decides. <strong>No private email or contact detail is shared without consent</strong>, and requesting access grants no rights to the work.</p>
      <div className="field"><label className="lbl">Purpose</label><select className="input" id="ar-purpose"><option>Collaboration discussion</option><option>Pilot partnership scoping</option><option>Methods / instrument reuse (with citation)</option><option>Funding / sponsorship inquiry</option><option>Recruitment / talent opportunity</option></select></div>
      <div className="field"><label className="lbl">Your message</label><textarea className="input" rows={4} value={accessMsg} onChange={e=>setAccessMsg(e.target.value)} placeholder="Who you are, what you propose, and what you will not do without agreement…"/></div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',flexWrap:'wrap'}}><button className="btn ghost" onClick={()=>setShowAccess(false)}>Cancel</button>
      <button className="btn primary" onClick={async()=>{ try{ await api.createAccessRequest({recordId:r.id,purpose:document.getElementById('ar-purpose').value,message:accessMsg}); setShowAccess(false); toast('Request sent through ALIMS. The owner receives it without exposing your private contact details.'); }catch(e){ toast(e.message); }}}>Send via ALIMS</button></div>
    </div></div>}
  </div>;
}

/* ---------------- Discover ---------------- */
function Discover({ go, toast }) {
  const [list,setList]=useState(null); const [q,setQ]=useState(''); const [disc,setDisc]=useState(''); const [ver,setVer]=useState(''); const [acc,setAcc]=useState('');
  const load=()=>{ const p=new URLSearchParams(); if(q)p.set('q',q); if(disc)p.set('discipline',disc); if(ver)p.set('verification',ver); if(acc)p.set('access',acc); api.records('?'+p.toString()).then(setList).catch(e=>toast(e.message)); };
  useEffect(()=>{ const t=setTimeout(load,250); return ()=>clearTimeout(t); },[q,disc,ver,acc]);
  return <div className="fade-in"><h2 style={{fontSize:28,margin:'0 0 6px'}}>Discover research</h2>
    <p style={{color:'var(--muted)',margin:'0 0 18px',maxWidth:680}}>Search by problem, question, method, person or institution — not just document keywords. Restricted work never leaks titles or abstracts here.</p>
    <div className="card" style={{padding:16,display:'flex',gap:10,flexWrap:'wrap',marginBottom:18}}>
      <input className="input" style={{flex:1,minWidth:220}} placeholder="Try: Artificial Intelligence Agriculture Africa · cassava · malaria early warning…" value={q} onChange={e=>setQ(e.target.value)} aria-label="Search research"/>
      <select className="input" style={{width:190}} value={disc} onChange={e=>setDisc(e.target.value)} aria-label="Discipline"><option value="">All disciplines</option>{['Artificial Intelligence','Public Health','Energy Systems','Food Science','Agronomy','Environmental Studies','History & Archives','Agriculture Technology'].map(d=><option key={d}>{d}</option>)}</select>
      <select className="input" style={{width:210}} value={ver} onChange={e=>setVer(e.target.value)} aria-label="Verification level"><option value="">Any verification</option>{['Institutionally Verified','Journal-Verified','Supervisor-Verified','Identity-Verified Deposit','Submitted'].map(d=><option key={d}>{d}</option>)}</select>
      <select className="input" style={{width:180}} value={acc} onChange={e=>setAcc(e.target.value)} aria-label="Access level"><option value="">Any access</option>{['Full public','Abstract public','Metadata public','Institution only'].map(d=><option key={d}>{d}</option>)}</select>
    </div>
    {!list ? <Skeleton/> : list.length===0 ? <Empty icon="search" title="No permitted records match" text="Try broader terms, or clear a filter. ALIMS only returns records you are allowed to see — an empty result protects restricted research by design." action={<button className="btn ghost" onClick={()=>{setQ('');setDisc('');setVer('');setAcc('')}}>Clear all filters</button>}/> :
    <div style={{display:'grid',gap:14}}>{list.map(r=><RecordRow key={r.id} r={r} go={go}/>)}</div>}
  </div>;
}

/* ---------------- Lineage ---------------- */
function Lineage({ go }) {
  const [data,setData]=useState(null);
  useEffect(()=>{ api.lineage().then(setData).catch(()=>{}); },[]);
  if(!data) return <Skeleton rows={3}/>;
  const label=(id)=>{ const r=data.records.find(x=>x.id===id); if(r) return r.title.length>52? r.title.slice(0,52)+'…' : r.title; const u=data.users.find(x=>x.id===id); if(u) return u.name+' ('+u.role+')'; const o={o1:'Sorghum continuation opportunity',o2:'AgriServe tomato challenge'}[id]; return o||id; };
  return <div className="fade-in"><h2 style={{fontSize:28,margin:'0 0 6px'}}>Academic lineage & knowledge graph</h2>
    <p style={{color:'var(--muted)',maxWidth:760,lineHeight:1.7}}>Every relationship is <strong>typed</strong> and <strong>evidence-qualified</strong>. Supervision is mentorship — it never implies ownership of a student’s later work. Machine-suggested edges stay private until a human accepts them.</p>
    <div className="card" style={{padding:22,marginTop:16,overflowX:'auto'}}>
      <svg viewBox="0 0 900 330" style={{minWidth:760,width:'100%'}} role="img" aria-label="Lineage graph connecting researchers, records and opportunities">
        <defs><marker id="ar2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#0B6B4A"/></marker></defs>
        {[[450,55,230,160],[450,55,680,160],[230,170,230,275],[680,170,680,275],[450,65,450,150]].map((l,i)=><line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} stroke="#5F3EF8" strokeWidth="2" strokeDasharray={i===4?'5 5':'0'} markerEnd="url(#ar2)" opacity=".6"/>)}
        {[[450,48,'Prof. Chidinma Okonkwo','Supervisor'],[230,160,'Yoruba MT · 2023','Journal-Verified'],[680,160,'Cassava AI · 2025','Institutionally Verified'],[230,282,'Corpus & code','Dataset'],[680,282,'Industry challenge','Activation']].map(([x,y,t,s],i)=>(<g key={i}><rect x={x-120} y={y-30} width="240" height="58" rx="14" fill="#fff" stroke="#E7E2D6"/><text x={x} y={y-2} textAnchor="middle" fontSize="13" fontWeight="700" fill="#111111">{t}</text><text x={x} y={y+17} textAnchor="middle" fontSize="11" fill="#5B6577">{s}</text></g>))}
        <text x="300" y="118" fontSize="11" fill="#0B6B4A" fontWeight="700">builds on</text><text x="458" y="118" fontSize="11" fill="#8A4B08" fontWeight="700">supervised (not ownership)</text><text x="560" y="230" fontSize="11" fill="#0B6B4A" fontWeight="700">resulted in</text>
      </svg></div>
    <div style={{display:'grid',gap:12,marginTop:18}}>{data.relationships.map((rel,i)=><div key={i} className="card" style={{padding:'16px 18px',display:'flex',gap:14,flexWrap:'wrap',alignItems:'center'}}>
      <span style={{flex:1,minWidth:220,fontSize:14.5}}><button className="btn ghost small" onClick={()=> rel.from.startsWith('r')&&go('record:'+rel.from)}>{label(rel.from)}</button> <strong style={{color:'var(--emerald)'}}>—{rel.type}→</strong> <button className="btn ghost small" onClick={()=> rel.to.startsWith('r')&&go('record:'+rel.to)}>{label(rel.to)}</button></span>
      <span className={`badge ${rel.state.includes('Verified')?'green':rel.state.includes('suggested')?'red':'amber'}`}>{rel.state}</span>
      <span style={{fontSize:13,color:'var(--muted)',flexBasis:'100%'}}>{rel.basis}{rel.state.includes('suggested')?' · This suggestion is explainable, dismissible, and not public fact.':''}</span></div>)}</div>
  </div>;
}

/* ---------------- Opportunities ---------------- */
const EMPTY_OPP={title:'',type:'Collaboration Request',field:'Multidisciplinary',description:'',needs:'',deadline:'',linkedRecord:''};
function Opportunities({ user, go, toast }) {
  const [list,setList]=useState(null); const [show,setShow]=useState(false); const [edit,setEdit]=useState(null); const [f,setF]=useState(EMPTY_OPP); const [saving,setSaving]=useState(false);
  const load=()=>api.opportunities().then(setList).catch(e=>toast(e.message)); useEffect(load,[]);
  const save=async(e)=>{ e.preventDefault(); setSaving(true); try{ if(edit) await api.updateOpportunity(edit.id,f); else await api.createOpportunity(f); toast(edit?'Opportunity updated.':'Opportunity published. Interested researchers respond through ALIMS — accept a collaboration charter before sharing restricted material.'); setShow(false); setEdit(null); setF(EMPTY_OPP); load(); }catch(err){ toast(err.message);} setSaving(false); };
  const del=async(o)=>{ if(!confirm('Delete this opportunity?'))return; const prev=list; setList(list.filter(x=>x.id!==o.id)); try{ await api.deleteOpportunity(o.id); toast('Opportunity deleted.'); }catch(e){ setList(prev); toast(e.message);} };
  return <div className="fade-in"><div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:12,alignItems:'center',marginBottom:16}}>
    <div><h2 style={{fontSize:28,margin:'0 0 6px'}}>Collaboration & activation opportunities</h2><p style={{color:'var(--muted)',margin:0}}>Continue unfinished research, answer verified industry challenges, find partners — under explicit charters.</p></div>
    <button className="btn primary" onClick={()=>{setEdit(null);setF(EMPTY_OPP);setShow(true)}}>+ Post opportunity</button></div>
    {!list?<Skeleton/>:list.length===0?<Empty icon="users" title="No opportunities yet" text="Post the first one: a continuation need, a collaboration call, or a verified company challenge." action={<button className="btn primary" onClick={()=>setShow(true)}>Post an opportunity</button>}/>:
    <div style={{display:'grid',gap:14}}>{list.map(o=><article key={o.id} className="card" style={{padding:22}}>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}><span className="badge green">{o.type}</span><span className="badge dark">{o.field}</span><span className="badge amber">{o.status} · {o.responses} responses</span>{o.deadline && <span className="badge gray">⏰ {o.deadline}</span>}</div>
      <h3 style={{margin:'0 0 8px',fontSize:19,lineHeight:1.45}}>{o.title}</h3>
      <p style={{fontSize:13.5,color:'var(--muted)',margin:'0 0 8px'}}>{o.org} · posted by {o.ownerName} · {o.createdAt}</p>
      <p style={{lineHeight:1.75,color:'var(--ink2)',margin:'0 0 10px'}}>{o.description}</p>
      {o.needs && <p style={{fontSize:14}}><strong>Needed:</strong> {o.needs}</p>}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}>
        {o.ownerId!==user.id && <button className="btn primary small" onClick={async()=>{ try{ const u=await api.respondOpportunity(o.id); setList(list.map(x=>x.id===o.id?u:x)); toast('Interest recorded through ALIMS. Next step: agree a collaboration charter before any restricted sharing.'); }catch(e){ toast(e.message);} }}>Express interest</button>}
        {o.linkedRecord && <button className="btn ghost small" onClick={()=>go('record:'+o.linkedRecord)}>View linked record</button>}
        <CharterButton id={o.id} toast={toast}/>
        {o.ownerId===user.id && <><button className="btn ghost small" onClick={()=>{setEdit(o);setF(o);setShow(true)}}>Edit</button><button className="btn ghost small" style={{color:'var(--red)'}} onClick={()=>del(o)}>Delete</button></>}
      </div></article>)}</div>}
    {show && <div className="modal-bg" onClick={()=>setShow(false)}><div className="modal" onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Opportunity form">
      <h3 style={{fontSize:23,margin:'0 0 14px'}}>{edit?'Edit opportunity':'Post an opportunity'}</h3>
      <form onSubmit={save}>
        <div className="field"><label className="lbl">Title *</label><input className="input" required value={f.title} onChange={e=>setF({...f,title:e.target.value})} placeholder="State the problem or the continuation need"/></div>
        <div className="grid2"><div className="field"><label className="lbl">Type</label><select className="input" value={f.type} onChange={e=>setF({...f,type:e.target.value})}>{['Collaboration Request','Research Continuation','Research Challenge','Sponsored Research Inquiry','Expert Consultation','Recruitment / Talent','Funding Opportunity','Mentorship'].map(t=><option key={t}>{t}</option>)}</select></div>
        <div className="field"><label className="lbl">Field</label><input className="input" value={f.field} onChange={e=>setF({...f,field:e.target.value})}/></div></div>
        <div className="field"><label className="lbl">Problem statement *</label><textarea className="input" rows={4} required value={f.description} onChange={e=>setF({...f,description:e.target.value})} placeholder="What is done, what is needed, what is explicitly not granted by discovery…"/></div>
        <div className="grid2"><div className="field"><label className="lbl">Desired roles / needs</label><input className="input" value={f.needs} onChange={e=>setF({...f,needs:e.target.value})}/></div>
        <div className="field"><label className="lbl">Deadline</label><input type="date" className="input" value={f.deadline||''} onChange={e=>setF({...f,deadline:e.target.value})}/></div></div>
        <div style={{display:'flex',gap:10,justifyContent:'flex-end',flexWrap:'wrap'}}><button type="button" className="btn ghost" onClick={()=>setShow(false)}>Cancel</button><button className="btn primary" disabled={saving}>{saving?'Saving…':'Publish opportunity'}</button></div>
      </form></div></div>}
  </div>;
}

/* ---------------- Passport ---------------- */
function Passport({ user, researchers, go }) {
  const [sel,setSel]=useState(user); const [mine,setMine]=useState([]);
  useEffect(()=>{ setSel(user); },[user]);
  useEffect(()=>{ if(sel) api.records('?ownerId='+sel.id).then(setMine).catch(()=>setMine([])); },[sel]);
  const person=sel||user;
  return <div className="fade-in">
    <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:16}}><select className="input" style={{maxWidth:360}} value={person.id} onChange={e=>setSel(researchers.find(r=>r.id===e.target.value)||user)} aria-label="View passport">
      {researchers.map(r=><option key={r.id} value={r.id}>{r.name} — {r.role}</option>)}</select>
      <span className="badge green">Evidence-labelled passport · No opaque “researcher score”, ever</span></div>
    <div className="card" style={{padding:30}}>
      <div style={{display:'flex',gap:18,flexWrap:'wrap'}}><span className="avatar lg">{initials(person.name)}</span>
      <div style={{flex:1,minWidth:240}}><h2 style={{fontSize:27,margin:'0 0 4px'}}>{person.name}</h2>
      <p style={{color:'var(--muted)',margin:'0 0 8px'}}>{person.title} {person.company?'· '+person.company:''}</p>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <span className={`badge ${person.verified?.identity?'green':'amber'}`}>{person.verified?.identity?<><Icon name="check" size={12}/> Identity verified</>:'Identity unverified'} · self-declared source labelled</span>
        <span className={`badge ${person.verified?.affiliation?'green':'gray'}`}>{person.verified?.affiliation?<><Icon name="check" size={12}/> Institution-verified affiliation</>:'No institutional affiliation claimed'}</span>
        <span className="badge blue">Availability: {person.availability||'—'}</span></div>
      {person.bio && <p style={{lineHeight:1.75,color:'var(--ink2)',maxWidth:720}}>{person.bio}</p>}
      <div>{(person.fields||[]).map(f=><span key={f} className="chip">{f}</span>)}{(person.skills||[]).map(s=><span key={s} className="chip" style={{background:'var(--mint)'}}>{s}</span>)}</div>
      </div></div>
    </div>
    <h3 style={{margin:'24px 0 12px'}}>Research Records & contributions</h3>
    {mine.length===0?<Empty icon="graduation-cap" title="No public records on this passport yet" text="Verified and self-published records appear here with their honest verification levels. Drafts stay private."/>:
    <div style={{display:'grid',gap:14}}>{mine.map(r=><RecordRow key={r.id} r={r} go={go}/>)}</div>}
    {person.id===user.id && <div className="card" style={{padding:20,marginTop:18}}><h3 style={{margin:'0 0 6px',fontSize:17}}>Connect ORCID iD</h3>
      <p className="hint" style={{marginBottom:12}}>Link your persistent researcher identifier so records, imports and journal versions reconcile automatically. Format: 0000-0000-0000-0000.</p>
      <OrcidForm user={user} toastFn={null}/></div>}
    <p style={{fontSize:13,color:'var(--muted)',marginTop:16}}>Every claim above is labelled by evidence source (self-declared, institution-verified, journal-linked). ALIMS will never compress a person into a single integrity or quality score.</p>
  </div>;
}

/* ---------------- Review queue / Requests / Disputes / Institutions / Verify ---------------- */
function ReviewQueue({ user, go, toast }) {
  const [list,setList]=useState(null);
  useEffect(()=>{ api.records().then(rs=>setList(rs.filter(r=>['Submitted','In Review','Returned for Revision'].includes(r.status)))).catch(e=>toast(e.message)); },[]);
  return <div className="fade-in"><h2 style={{fontSize:28,margin:'0 0 6px'}}>Review queue</h2>
  <p style={{color:'var(--muted)',maxWidth:720,lineHeight:1.7}}>Assigned and institution-visible work awaiting a <strong>human</strong> decision. Open a record to confirm supervision, return it with reasons, or complete institutional verification. Similarity signals alone never decide anything.</p>
  {!list?<Skeleton/>:list.length===0?<Empty icon="clock" title="Queue clear" text="No records are awaiting review. New submissions will appear here with their current version and declared contributors."/>:
  <div style={{display:'grid',gap:14,marginTop:16}}>{list.map(r=><RecordRow key={r.id} r={r} go={go}/>)}</div>}</div>;
}
export function RequestsPage({ user, toast }) {
  const [list,setList]=useState(null); const load=()=>api.accessRequests().then(setList).catch(e=>toast(e.message)); useEffect(load,[]);
  const respond=async(a,status)=>{ const prev=list; setList(list.map(x=>x.id===a.id?{...x,status}:x)); try{ await api.patchAccessRequest(a.id,status); toast(status==='Declined'?'Declined. The requester receives a neutral decline — no private reason is shared.':'Response recorded. Share material only under the agreed terms/charter.'); }catch(e){ setList(prev); toast(e.message);} };
  return <div className="fade-in"><h2 style={{fontSize:28,margin:'0 0 6px'}}>Access requests & introductions</h2>
  <p style={{color:'var(--muted)',maxWidth:720,lineHeight:1.7}}>Permissioned contact only. Nobody receives private emails or embargoed files without consent, and a decline is always neutral.</p>
  {!list?<Skeleton/>:list.length===0?<Empty icon="mail" title="No requests yet" text="When someone requests access to your records — or you request theirs — it will appear here."/>:
  <div style={{display:'grid',gap:14,marginTop:16}}>{list.map(a=><article key={a.id} className="card" style={{padding:20}}>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:8}}><span className={`badge ${a.status==='Approved'?'green':a.status==='Declined'?'red':'amber'}`}>{a.status}</span><span className="badge gray">{a.purpose}</span><span className="badge gray">{a.date}</span></div>
    <strong style={{lineHeight:1.5}}>{a.recordTitle}</strong>
    <p style={{fontSize:14,color:'var(--muted)',margin:'8px 0'}}>{a.requester}</p><p style={{lineHeight:1.7,margin:'0 0 12px'}}>{a.message}</p>
    {a.status==='Pending' && <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className="btn primary small" onClick={()=>respond(a,'Approved')}>Approve</button><button className="btn ghost small" onClick={()=>respond(a,'More info requested')}>Request more info</button><button className="btn ghost small" style={{color:'var(--red)'}} onClick={()=>respond(a,'Declined')}>Decline (neutral)</button></div>}
  </article>)}</div>}</div>;
}
export function DisputesPage({ user, records, toast }) {
  const [list,setList]=useState(null); const [form,setForm]=useState({category:'Incorrect Metadata',recordId:'',detail:''}); const [show,setShow]=useState(false);
  const load=()=>api.disputes().then(setList).catch(e=>toast(e.message)); useEffect(load,[]);
  const submit=async(e)=>{ e.preventDefault(); try{ await api.createDispute(form); setShow(false); load(); toast('Dispute submitted to Triage. It stays private to authorised parties — nobody is publicly labelled while it is reviewed.'); }catch(err){ toast(err.message);} };
  return <div className="fade-in"><div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:12}}><div><h2 style={{fontSize:28,margin:'0 0 6px'}}>Disputes & corrections</h2><p style={{color:'var(--muted)',margin:0}}>Submitted → Triage → Evidence Requested → Under Review → Resolved / Dismissed / Escalated. Humans decide; the system never silently removes anyone.</p></div>
  <button className="btn primary" onClick={()=>setShow(true)}>Raise a dispute</button></div>
  {!list?<Skeleton/>:list.length===0?<Empty icon="scale" title="No disputes" text="Metadata errors, contribution disagreements, rights claims and lineage errors can be raised here and tracked transparently."/>:
  <div style={{display:'grid',gap:14,marginTop:16}}>{list.map(d=><article key={d.id} className="card" style={{padding:20}}>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:8}}><span className="badge amber">{d.category}</span><span className={`badge ${d.status==='Resolved'?'green':d.status==='Dismissed'?'gray':'blue'}`}>{d.status}</span><span className="badge gray">{d.date}</span></div>
    <strong>{d.recordTitle||'General'}</strong><p style={{fontSize:13.5,color:'var(--muted)',margin:'6px 0'}}>Raised by {d.raisedBy} · {d.visibility}</p><p style={{lineHeight:1.7,margin:0}}>{d.detail}</p>
    {['Department Admin','Librarian','Supervisor'].includes(user.role) && d.status!=='Resolved' && <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}>{['Evidence Requested','Under Review','Resolved','Dismissed','Escalated'].map(s=><button key={s} className="btn ghost small" onClick={async()=>{ try{ const u=await api.patchDispute(d.id,s); setList(list.map(x=>x.id===d.id?{...x,status:u.status}:x)); }catch(e){ toast(e.message);} }}>{s}</button>)}</div>}
  </article>)}</div>}
  {show && <div className="modal-bg" onClick={()=>setShow(false)}><div className="modal" onClick={e=>e.stopPropagation()}><h3 style={{fontSize:23,margin:'0 0 14px'}}>Raise a dispute / correction</h3>
  <form onSubmit={submit}><div className="grid2"><div className="field"><label className="lbl">Category</label><select className="input" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{['Incorrect Metadata','Authorship / Contribution','False Institution Claim','Duplicate / Provenance Conflict','Copyright / Rights Claim','Privacy / Confidentiality','Certificate / Verification Error','Relationship / Lineage Error'].map(c=><option key={c}>{c}</option>)}</select></div>
  <div className="field"><label className="lbl">Related record</label><select className="input" value={form.recordId} onChange={e=>setForm({...form,recordId:e.target.value})}><option value="">General / none</option>{records.map(r=><option key={r.id} value={r.id}>{r.title.slice(0,70)}…</option>)}</select></div></div>
  <div className="field"><label className="lbl">Detail *</label><textarea className="input" rows={4} required value={form.detail} onChange={e=>setForm({...form,detail:e.target.value})} placeholder="What is wrong, what evidence supports the correction, and what outcome you seek…"/></div>
  <div style={{display:'flex',gap:10,justifyContent:'flex-end',flexWrap:'wrap'}}><button type="button" className="btn ghost" onClick={()=>setShow(false)}>Cancel</button><button className="btn primary">Submit to triage</button></div></form></div></div>}
  </div>;
}
export function InstitutionsPage({ institutions }) {
  return <div className="fade-in"><h2 style={{fontSize:28,margin:'0 0 6px'}}>Institutions</h2>
  <p style={{color:'var(--muted)',maxWidth:720,lineHeight:1.7}}>Only <strong>Verified</strong> institutions may issue Institutionally Verified status and certificates. Each institution governs its own departments, workflows and retention — and can never see another institution’s private records.</p>
  <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:16,marginTop:18}} className="ov-grid">{institutions.map(i=><article key={i.id} className="card" style={{padding:24}}>
    <div style={{display:'flex',gap:14,alignItems:'center',flexWrap:'wrap'}}><span className="avatar lg" style={{background:i.color}}>{i.short.slice(0,2)}</span><div><h3 style={{margin:'0 0 3px',fontSize:19}}>{i.name}</h3><p style={{margin:0,fontSize:13,color:'var(--muted)'}}>{i.city} · {i.category} · {i.domain}</p></div>
    <span className={`badge ${i.status==='Verified'?'green':'amber'}`} style={{marginLeft:'auto'}}>{i.status}</span></div>
    <p style={{fontSize:14,color:'var(--muted)',lineHeight:1.7}}>{i.records} Research Records on ALIMS · {(i.members||0).toLocaleString()} members · Departments: {(i.departments||[]).join(', ')}</p>
    <div className="progress" aria-hidden="true"><div style={{width: i.status==='Verified'?'86%':'30%'}}/></div>
    <p style={{fontSize:12.5,color:'var(--muted)'}}>Metadata completeness & digitisation progress shown to authorised institutional roles in reporting.</p>
  </article>)}</div></div>;
}
export function VerifyPage({ initial='' }) {
  const [code,setCode]=useState(initial||'NXR-2025-01041'); const [res,setRes]=useState(null); const [busy,setBusy]=useState(false);
  const go=async(e)=>{ e?.preventDefault(); setBusy(true); try{ setRes(await api.verify(code)); }catch(err){ setRes({status:'Error',message:err.message}); } setBusy(false); };
  useEffect(()=>{ if(initial) go(); },[initial]);
  return <div className="fade-in" style={{maxWidth:760,margin:'0 auto'}}>
    <div style={{textAlign:'center',marginBottom:22}}><span className="badge green">PUBLIC · NO SIGN-IN NEEDED FOR THIS CHECK</span>
    <h2 style={{fontSize:32,margin:'14px 0 8px'}}>Verify a certificate or Research Record</h2>
    <p style={{color:'var(--muted)',lineHeight:1.7}}>Enter an NXR-ID or certificate number — or scan a certificate QR code. You’ll see only approved public verification facts, in the spirit of an employer check that completes in seconds.</p></div>
    <form onSubmit={go} className="card" style={{padding:20,display:'flex',gap:10,flexWrap:'wrap'}}><input className="input" style={{flex:1,minWidth:230}} value={code} onChange={e=>setCode(e.target.value)} placeholder="e.g. NXR-2025-01041 or CERT-UI-2025-8841" aria-label="Identifier to verify"/><button className="btn primary" disabled={busy}>{busy?'Checking…':'Verify now'}</button></form>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12,justifyContent:'center'}}>{['NXR-2025-01041','CERT-UNN-2025-1176','NXR-1999-00000'].map(c=><button key={c} className="tab" onClick={()=>{setCode(c); setTimeout(()=>{},0);}}>{c}</button>)}</div>
    {busy && <div style={{marginTop:18}}><Skeleton rows={1}/></div>}
    {res && !busy && <div className="card fade-in" style={{padding:28,marginTop:18,textAlign:'center'}} aria-live="polite">
      <span className={`badge ${res.status==='Valid'?'green':res.status==='Not Found'?'red':'amber'}`} style={{fontSize:14,padding:'7px 16px'}}>{res.status==='Valid'?<><Icon name="check" size={15}/> CERTIFICATE VALID</>:res.status.toUpperCase()}</span>
      {res.title ? <><h3 style={{fontSize:22,lineHeight:1.45,margin:'16px 0 8px'}}>{res.title}</h3>
      <p style={{lineHeight:1.8,color:'var(--ink2)'}}>{res.nxrId} · {res.institution}<br/>{res.type} · {res.year} · {res.verification}<br/>Researchers: {(res.researchers||[]).join(', ')}{res.certificateId && <><br/>Certificate: {res.certificateId} · Issued {res.issuedAt}</>}</p>
      <div className="qrbox" style={{margin:'16px auto'}} aria-hidden="true"><span>ALIMS <Icon name="check" size={11}/></span></div>
      <p style={{fontSize:13,color:'var(--muted)',lineHeight:1.7,maxWidth:560,margin:'0 auto'}}>{res.note}</p></> :
      <p style={{lineHeight:1.75,color:'var(--ink2)',maxWidth:540,margin:'14px auto 0'}}>{res.message}</p>}
    </div>}
    <div className="card" style={{padding:20,marginTop:18}}><h3 style={{margin:'0 0 10px',fontSize:17}}>What the statuses mean</h3>
    <ul style={{lineHeight:1.9,fontSize:14.5,color:'var(--ink2)',margin:0,paddingLeft:20}}>
      <li><strong>Valid</strong> — the certificate currently supports the stated verification claim for that version.</li>
      <li><strong>Superseded</strong> — a later version/certificate replaced it (often a routine correction). It is not, by itself, a misconduct signal.</li>
      <li><strong>Revoked</strong> — the verification must no longer be relied upon. The public page still shows no private detail.</li>
      <li><strong>Not Found</strong> — no ALIMS record matches. Double-check the code; absence alone proves nothing about a person.</li></ul></div>
  </div>;
}
export { Overview, RecordsPage, RecordDetail, Discover, Lineage, Opportunities, Passport, ReviewQueue };

export function OrcidForm({ user }) {
  const [v, setV] = useState(user.orcid || ''); const [msg, setMsg] = useState('');
  return <form onSubmit={async e=>{ e.preventDefault(); try{ const d=await ops.orcid(v); setMsg('ORCID linked: '+d.user.orcid+' ('+d.user.orcidMode+'). Imports from ORCID/Crossref will now reconcile to this passport.'); }catch(err){ setMsg(err.message); } }}>
    <div style={{display:'flex',gap:10,flexWrap:'wrap'}}><input className="input mono" style={{maxWidth:280}} value={v} onChange={e=>setV(e.target.value)} placeholder="0000-0002-1825-0097" aria-label="ORCID iD"/>
    <button className="btn primary small">Link ORCID</button></div>{msg && <p className="hint" role="status">{msg}</p>}</form>;
}

export function CharterButton({ id, toast }) {
  const [ch, setCh] = useState(null);
  useEffect(()=>{ ops.charter(id).then(setCh).catch(()=>{}); },[id]);
  const parties = ch?.parties?.length || 0;
  return <button className="btn ghost small" onClick={async()=>{ try{ const c=await ops.acceptCharter(id); setCh(c); toast('Collaboration charter accepted and recorded: roles, confidentiality, credit and IP expectations are now binding context before restricted sharing. Parties: '+c.parties.join(', ')); }catch(e){ toast(e.message); } }}>
    <Icon name="clipboard" size={14}/> {parties ? `Charter · ${parties} part${parties>1?'ies':'y'} accepted` : 'Accept collaboration charter'}</button>;
}
