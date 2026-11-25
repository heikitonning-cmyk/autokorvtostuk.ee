'use client'
import { useRef, useState, type PointerEvent } from 'react'
import { sheetDefaults, type SheetJob, type SheetInput, type SavedSheet, type DeliverySnapshot, type Signature } from '@/lib/delivery-sheet'
import styles from './DeliverySheetForm.module.css'

const money=(c:number)=>(c/100).toLocaleString('et-EE',{style:'currency',currency:'EUR'})
const quantity=(n:number)=>n.toLocaleString('et-EE',{maximumFractionDigits:2})
function SignatureImage({value}:{value:Signature}) {
  return <>{value.map((stroke,i)=><polyline key={i} points={stroke.map(p=>p.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>)}</>
}
function SheetReview({sheet}:{sheet:DeliverySnapshot}) {
  const {input}=sheet
  return <div className="stack">
    <div><h3>ARVE-SAATELEHT</h3><strong>{sheet.supplier.name}</strong><p>Reg. {sheet.supplier.registry} · {sheet.supplier.address}<br/>Tel. {sheet.supplier.phone}</p></div>
    <div><strong>Tellija / maksja: {input.customer}</strong><p>{input.billingAddress}<br/>{input.contact}{input.email&&` · ${input.email}`}</p></div>
    <div><strong>{sheet.object}</strong>{sheet.address!==sheet.object&&<p>{sheet.address}</p>}<p>{sheet.description}</p></div>
    <p><strong>{input.date.split('-').reverse().join('.')} · {input.start}–{input.end}{input.nextDay?' (+1 päev)':''}</strong><br/>Tööaeg {Math.floor(sheet.minutes/60)} h {sheet.minutes%60} min · Masin {sheet.vehicle}</p>
    <div className={styles.rows}>{sheet.rows.map((row,i)=><div className={styles.row} key={i}><div><strong>{row.label}</strong><small>{quantity(row.quantity)} {row.unit} × {money(row.rate)}</small></div><strong>{money(row.amount)}</strong></div>)}</div>
    <div className={styles.total}><strong>Kokku</strong><strong>{money(sheet.total)}</strong></div>
    <small>Hind vastavalt töö hinnastusele. See saateleht ei märgi arvet esitatuks ega tasutuks.</small>
  </div>
}
export function DeliverySheetForm({job,initial}:{job:SheetJob;initial:SavedSheet|null}) {
  const [input,setInput]=useState<SheetInput>(()=>sheetDefaults(job)),[open,setOpen]=useState(false)
  const [preview,setPreview]=useState<DeliverySnapshot|null>(null),[saved,setSaved]=useState(initial)
  const [signature,setSignature]=useState<Signature>([]),[confirmed,setConfirmed]=useState(false)
  const [error,setError]=useState(''),[busy,setBusy]=useState(false)
  const activePointer=useRef<number|null>(null)
  const change=<K extends keyof SheetInput>(key:K,value:SheetInput[K])=>{setInput(s=>({...s,[key]:value}));setPreview(null);setSignature([]);setConfirmed(false);setError('')}
  const point=(e:PointerEvent<SVGSVGElement>)=>{const b=e.currentTarget.getBoundingClientRect();return [Math.round(Math.max(0,Math.min(600,(e.clientX-b.left)/b.width*600))*10)/10,Math.round(Math.max(0,Math.min(200,(e.clientY-b.top)/b.height*200))*10)/10]}
  async function submit(action:'preview'|'sign') {
    setBusy(true);setError('')
    try {
      const response=await fetch(`/api/jobs/${encodeURIComponent(job.id)}/delivery-sheet`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,input,snapshot:preview,signature,confirmed})})
      const data=await response.json()
      if(!response.ok) throw new Error(data.error||'Salvestamine ebaõnnestus.')
      if(action==='preview'){setPreview(data.snapshot);setSignature([]);setConfirmed(false)}else{setSaved(data.saved);setPreview(null);setSignature([])}
    }catch(e){setError(e instanceof Error?e.message:'Ühendus katkes. Proovi uuesti.')}finally{setBusy(false)}
  }
  return <section className="detail-card stack" aria-label="Saateleht">
    <div className="day-team-heading"><h2>Saateleht ja tellija allkiri</h2>{saved&&<strong>{money(saved.snapshot.total)}</strong>}</div>
    <p>{saved?`Allkirjastatud · ${saved.snapshot.input.signer}`:'Sisesta tegelik tööaeg ja sõit. Tellija kinnitab telefoni ekraanil sõrmega.'}</p>
    <button type="button" className="button secondary wide" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'Peida saateleht':saved?'Vaata allkirjastatud saatelehte':'Täida saateleht'}</button>
    {open&&(saved?<><SheetReview sheet={saved.snapshot}/><strong>Tellija allkiri: {saved.snapshot.input.signer}</strong><svg className={styles.signature} viewBox="0 0 600 200" preserveAspectRatio="none" role="img" aria-label="Tellija salvestatud allkiri"><SignatureImage value={saved.signature}/></svg><small>Allkirjastatud {new Date(saved.signed_at).toLocaleString('et-EE',{timeZone:'Europe/Tallinn'})}. Allkirjastatud lehe andmed on lukustatud.</small></>:preview?<>
      <SheetReview sheet={preview}/>
      <button type="button" disabled={busy} className="button secondary" onClick={()=>{setPreview(null);setSignature([]);setConfirmed(false);setError('')}}>Tagasi andmeid muutma</button>
      <h3>Tellija allkiri</h3><p>{input.signer} — palun kontrolli ülal tööaega, sõitu ja kogusummat ning allkirjasta sõrmega allolevas kastis.</p>
      <svg className={styles.signature} viewBox="0 0 600 200" preserveAspectRatio="none" role="img" aria-label="Joonista tellija allkiri" style={{touchAction:'none'}}
        onPointerDown={e=>{if(busy||activePointer.current!==null)return;e.preventDefault();activePointer.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);const p=point(e);setSignature(s=>[...s,[p]])}}
        onPointerMove={e=>{if(activePointer.current!==e.pointerId||busy)return;e.preventDefault();const p=point(e);setSignature(s=>s.length?s.map((stroke,i)=>i===s.length-1?[...stroke,p]:stroke):s)}}
        onPointerUp={e=>{if(activePointer.current===e.pointerId)activePointer.current=null}}
        onPointerCancel={()=>{activePointer.current=null}} onLostPointerCapture={()=>{activePointer.current=null}}><SignatureImage value={signature}/></svg>
      <button type="button" className="button secondary" disabled={busy} onClick={()=>{setSignature([]);setConfirmed(false)}}>Kustuta allkiri</button>
      <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>Kinnitan tellijana ülal näidatud tööaja, teenused ja summa {money(preview.total)}.</label>
      <button type="button" className="button primary wide" disabled={busy||!confirmed||!signature.length} onClick={()=>submit('sign')}>{busy?'Salvestan…':'Kinnita ja salvesta allkirjastatud saateleht'}</button>
    </>:<form className="stack" onSubmit={e=>{e.preventDefault();submit('preview')}}>
      <fieldset disabled={busy} className={styles.fields}>
        <label>Tellija / maksja<input required maxLength={300} value={input.customer} onChange={e=>change('customer',e.target.value)}/></label>
        <details><summary>Tellija kontaktandmed</summary><div className="stack top-gap"><label>Tellija aadress<input maxLength={300} value={input.billingAddress} onChange={e=>change('billingAddress',e.target.value)}/></label><label>Telefon / kontaktisik<input maxLength={300} value={input.contact} onChange={e=>change('contact',e.target.value)}/></label><label>E-post<input type="email" maxLength={300} value={input.email} onChange={e=>change('email',e.target.value)}/></label></div></details>
        <label>Töö kuupäev<input required type="date" value={input.date} onChange={e=>change('date',e.target.value)}/></label>
        <div className={styles.times}><label>Tegelik algus<input required type="time" value={input.start} onChange={e=>change('start',e.target.value)}/></label><label>Tegelik lõpp<input required type="time" value={input.end} onChange={e=>change('end',e.target.value)}/></label></div>
        <label className={styles.check}><input type="checkbox" checked={input.nextDay} onChange={e=>change('nextDay',e.target.checked)}/>Lõpp järgmisel päeval</label>
        <label>Objektile ja tagasisõit<select value={input.transport} onChange={e=>change('transport',e.target.value as 'city'|'km')}><option value="city">Tallinn · 1 kmpl × 45 €</option><option value="km">Väljaspool Tallinna · 1 €/km</option></select></label>
        {input.transport==='km'&&<label>Edasi-tagasi kilomeetrid<input required type="number" min="0.01" max="10000" step="0.01" inputMode="decimal" value={input.km||''} onChange={e=>change('km',Number(e.target.value))}/></label>}
        <label className={styles.check}><input type="checkbox" checked={input.operatorWork} onChange={e=>change('operatorWork',e.target.checked)}/>Operaator teostab tööd</label>
        <label>Tellija allkirjastaja nimi<input required maxLength={300} autoComplete="name" value={input.signer} onChange={e=>change('signer',e.target.value)}/></label>
      </fieldset>
      <button className="button primary wide" disabled={busy}>{busy?'Koostan…':'Näita tellijale ja võta allkiri'}</button>
    </form>)}
    {error&&<p role="alert" className="alert danger">{error}</p>}
  </section>
}
