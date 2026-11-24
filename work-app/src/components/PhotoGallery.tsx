'use client'
import {useEffect,useRef,useState} from 'react'
import {photoTimeLabel} from '@/lib/photo-time'
import {PhotoArchiveActions} from './PhotoArchiveActions'
import styles from './PhotoGallery.module.css'

export type GalleryPhoto={id:string;signed_url?:string|null;created_at?:string|null;captured_at?:string|null;archived_at?:string|null;archive_error?:string|null}
export function PhotoGallery({photos,manager=false}:{photos:GalleryPhoto[];manager?:boolean}) {
 const [active,setActive]=useState<string|null>(null)
 const dialog=useRef<HTMLDialogElement>(null)
 const available=photos.filter(p=>p.signed_url).sort((a,b)=>(a.created_at??'').localeCompare(b.created_at??'')||a.id.localeCompare(b.id))
 const index=available.findIndex(p=>p.id===active),photo=available[index]
 const [failed,setFailed]=useState<string|null>(null)
 const touch=useRef<{x:number;y:number}|null>(null)
 const move=(delta:number)=>{if(available.length>1)setActive(available[(index+delta+available.length)%available.length].id)}
 useEffect(()=>{
   const el=dialog.current
   if(active&&el&&!el.open)el.showModal()
   if(!active&&el?.open)el.close()
 },[active])
 useEffect(()=>{
   if(!active)return
   const previous=document.body.style.overflow
   document.body.style.overflow='hidden'
   return ()=>{document.body.style.overflow=previous}
 },[active])
 return <>
 <div className="form-grid two">{photos.map(p=><div key={p.id} className="stack">
 {p.signed_url?<button type="button" className={styles.thumbnail} onClick={()=>{setFailed(null);setActive(p.id)}} aria-label="Ava foto galeriis"><img src={p.signed_url} alt="Töö foto" loading="lazy"/></button>:<p>Foto avamine ebaõnnestus. Värskenda lehte.</p>}
 <small>{photoTimeLabel(p)}</small>{p.archived_at&&<small>Dropboxi arhiivis</small>}
 {manager&&<>{p.archive_error&&<small role="status">{p.archive_error}</small>}<PhotoArchiveActions photoId={p.id}/></>}
 </div>)}</div>
 <dialog ref={dialog} className={styles.dialog} aria-label="Töö fotogalerii" onCancel={()=>setActive(null)} onClose={()=>setActive(null)} onKeyDown={e=>{if(e.key==='ArrowLeft'){e.preventDefault();move(-1)}if(e.key==='ArrowRight'){e.preventDefault();move(1)}}}>
 {photo&&<div className={styles.viewer}>
 <div className={styles.toolbar}><strong aria-live="polite">Foto {index+1} / {available.length}</strong><button type="button" className="button secondary" autoFocus onClick={()=>setActive(null)} aria-label="Sulge galerii">Sulge ✕</button></div>
 <div className={styles.stage} onTouchStart={e=>{touch.current={x:e.touches[0].clientX,y:e.touches[0].clientY}}} onTouchEnd={e=>{const start=touch.current;touch.current=null;if(!start||!e.changedTouches[0])return;const dx=e.changedTouches[0].clientX-start.x,dy=e.changedTouches[0].clientY-start.y;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)move(dx<0?1:-1)}}>
 {failed===photo.id?<p role="alert">Foto laadimine ebaõnnestus. Värskenda lehte ja proovi uuesti.</p>:<img key={photo.id} src={photo.signed_url!} alt={`Töö foto ${index+1}`} onError={()=>setFailed(photo.id)}/>}
 </div>
 <div className={styles.controls}><button type="button" className="button secondary" aria-label="Eelmine foto" disabled={available.length<2} onClick={()=>move(-1)}>← Eelmine</button><button type="button" className="button secondary" aria-label="Järgmine foto" disabled={available.length<2} onClick={()=>move(1)}>Järgmine →</button></div>
 <p className={styles.caption}>{photoTimeLabel(photo)}</p>
 </div>}
 </dialog>
 </>
}
