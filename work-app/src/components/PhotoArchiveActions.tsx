'use client'
import {useState} from 'react'
import {useRouter} from 'next/navigation'
export function PhotoArchiveActions({jobId,photoId}:{jobId?:string;photoId?:string}){
 const router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 async function run(){
  if(photoId&&!window.confirm('Kustutada see foto äpist ja Dropboxi arhiivist?'))return
  setBusy(true);setMessage('')
  try{
   const r=await fetch('/api/dropbox',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(photoId?{action:'delete',photoId,confirm:true}:{action:'archive-job',jobId})})
   const data=await r.json();if(!r.ok)throw new Error(data.error)
   if(!photoId)setMessage('Arhiveeritud: '+data.archived+'. Ebaõnnestunud: '+data.failed+'.')
   router.refresh()
  }catch(e){setMessage(e instanceof Error?e.message:'Toiming ebaõnnestus.')}finally{setBusy(false)}
 }
 return <div className="stack"><button className="button secondary" disabled={busy} onClick={run}>{busy?'Töötlen…':photoId?'Kustuta foto':'Tõsta selle töö fotod Dropboxi'}</button>{message&&<p role="status">{message}</p>}</div>
}
