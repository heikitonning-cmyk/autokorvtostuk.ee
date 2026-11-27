'use client'
import { useEffect,useState } from 'react'
export function PhotoArchiveSettings() {
 const [status,setStatus]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 async function call(action:string) {
  const r=await fetch('/api/dropbox',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})})
  const data=await r.json();if(!r.ok)throw new Error(data.error);return data
 }
 useEffect(()=>{call('status').then(setStatus).catch(e=>setMessage(e.message))},[])
 async function run(action:string){
  setBusy(true);setMessage('')
  try{
   const result=await call(action)
   if(action==='connect'){window.location.assign(result.url);return}
   setMessage('Arhiveeritud: '+result.archived+'. Ebaõnnestunud: '+result.failed+'.')
   setStatus(await call('status'))
  }catch(e){setMessage(e instanceof Error?e.message:'Toiming ebaõnnestus.')}finally{setBusy(false)}
 }
 return <section className="detail-card stack"><h2>Fotode arhiiv · Dropbox</h2>
 <p>Üle 30 päeva vanade tööde fotod liiguvad automaatselt Dropboxi. Fotod jäävad töö juures avatavaks. Äpi salvestusruum vabaneb alles pärast koopia kontrollimist.</p>
 {status&&<><strong>{status.connected?'Dropbox ühendatud':'Dropbox pole ühendatud'}</strong><p>Äpi salvestusruumis {status.local} fotot · Dropboxis {status.archived} fotot</p>{status.lastRun&&<p className="muted">Viimane arhiivikontroll: {new Date(status.lastRun).toLocaleString('et-EE')}{status.lastResult?.failed>0?' · Mõned fotod ootavad korduskatset.':''}</p>}</>}
 <div className="form-grid two"><button disabled={busy} className="button secondary" onClick={()=>run('connect')}>{status?.connected?'Ühenda Dropbox uuesti':'Ühenda Dropbox'}</button>{status?.connected&&<button disabled={busy} className="button primary" onClick={()=>run('archive-old')}>{busy?'Töötlen…':'Arhiveeri vanad fotod kohe'}</button>}</div>
 <p className="muted">Kaust: Apps / Autokorvtostuk fotoarhiiv / Toode fotod / kuupäev ja aadress. Ühe korraga kuni 20 fotot; ülejäänud jätkuvad järgmisel kontrollil.</p>
 {message&&<p role="status">{message}</p>}
 </section>
}
