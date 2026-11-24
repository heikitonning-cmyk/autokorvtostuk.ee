'use client'
import {useRef,useState} from 'react'
import {jpegCaptureTime} from '@/lib/photo-time'
import {useRouter} from 'next/navigation'
async function prepare(file:File):Promise<Blob>{
 if(!file.type.startsWith('image/'))throw new Error('Vali pildifail.')
 const url=URL.createObjectURL(file)
 try{
 const image=new Image()
 image.src=url
 await image.decode()
 const scale=Math.min(1,2000/Math.max(image.width,image.height))
 const canvas=document.createElement('canvas')
 canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale)
 const ctx=canvas.getContext('2d')
 if(!ctx)throw new Error('Pilti ei saanud töödelda.')
 ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height)
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Pilti ei saanud töödelda.')),'image/jpeg',0.85))
 if(blob.size>3*1024*1024)throw new Error('Pilt on liiga suur. Vali väiksem foto.')
 return blob
 }catch(e){throw new Error(e instanceof Error&&e.message.includes('suur')?e.message:'Pilti ei saanud avada. Proovi JPG- või PNG-faili.')}
 finally{URL.revokeObjectURL(url)}
}
export function PhotoUploader({jobId,jobStopId}:{jobId:string;jobStopId?:string}){
 const camera=useRef<HTMLInputElement>(null),gallery=useRef<HTMLInputElement>(null)
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const router=useRouter()
 async function upload(files:FileList|null){
 if(!files?.length||busy)return
 setBusy(true);setMessage('')
 let saved=0;const failed:string[]=[]
 for(const file of Array.from(files)){
 try{
 const capturedAt=jpegCaptureTime(await file.slice(0,1024*1024).arrayBuffer())
 const body=new FormData();body.set('file',await prepare(file),'photo.jpg');body.set('category','during')
 if(capturedAt)body.set('capturedAt',capturedAt)
 if(jobStopId)body.set('jobStopId',jobStopId)
 const res=await fetch('/api/jobs/'+jobId+'/photos',{method:'POST',body})
 if(!res.ok)throw new Error(res.status===403?'Puudub selle töö fotode lisamise õigus.':'Salvestamine ebaõnnestus. Proovi uuesti.')
 saved++
 }catch(e){failed.push(file.name+': '+(e as Error).message)}
 }
 setBusy(false);setMessage('Salvestatud '+saved+' fotot.'+(failed.length?' '+failed.join(' '):''))
 if(camera.current)camera.current.value='';if(gallery.current)gallery.current.value=''
 router.refresh()
 }
 return <div className="stack">
 <input ref={camera} className="sr-only" aria-label="Pildista" type="file" accept="image/*" capture="environment" disabled={busy} onChange={e=>upload(e.target.files)}/>
 <input ref={gallery} className="sr-only" aria-label="Vali fotod" type="file" accept="image/*" multiple disabled={busy} onChange={e=>upload(e.target.files)}/>
 <div className="form-grid two"><button type="button" className="button secondary" disabled={busy} onClick={()=>camera.current?.click()}>Pildista</button><button type="button" className="button secondary" disabled={busy} onClick={()=>gallery.current?.click()}>Lisa galeriist</button></div>
 <small role="status">{busy?'Laen fotosid…':message}</small></div>
}

