'use client'
import { useEffect, useId, useRef, useState, type PointerEvent } from 'react'
import { validateSignature, type Signature } from '@/lib/delivery-sheet'
import styles from './SignaturePad.module.css'

export function SignaturePad({disabled,hasSignature,onDone}:{disabled:boolean;hasSignature:boolean;onDone:(value:Signature)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null),surface=useRef<SVGSVGElement>(null)
  const pointer=useRef<number|null>(null),strokes=useRef<Signature>([])
  const [draft,setDraft]=useState<Signature>([]),[height,setHeight]=useState(400),[error,setError]=useState('')
  const title=useId(),previousOverflow=useRef(''),opened=useRef(false)
  useEffect(()=>{
    const svg=surface.current
    if(!svg)return
    const observer=new ResizeObserver(()=>{
      const box=svg.getBoundingClientRect()
      if(box.width>0&&box.height>0)setHeight(600*box.height/box.width)
    })
    observer.observe(svg)
    return()=>observer.disconnect()
  },[])
  useEffect(()=>()=>{if(opened.current)document.body.style.overflow=previousOverflow.current},[])
  function close() {pointer.current=null;dialog.current?.close();if(opened.current)document.body.style.overflow=previousOverflow.current;opened.current=false}
  function open() {
    strokes.current=[];setDraft([]);setError('');pointer.current=null
    previousOverflow.current=document.body.style.overflow
    dialog.current?.showModal();opened.current=true;document.body.style.overflow='hidden'
  }
  function point(e:PointerEvent<SVGSVGElement>) {
    const box=e.currentTarget.getBoundingClientRect()
    return [Math.max(0,Math.min(600,(e.clientX-box.left)*600/box.width)),Math.max(0,Math.min(height,(e.clientY-box.top)*600/box.width))]
  }
  function done() {
    try {
      const points=strokes.current.flat()
      if(!points.length)throw new Error('Palun joonista allkiri.')
      const xs=points.map(p=>p[0]),ys=points.map(p=>p[1])
      const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys)
      const scale=Math.min(1,560/Math.max(1,maxX-minX),160/Math.max(1,maxY-minY))
      const left=(600-(maxX-minX)*scale)/2,top=(200-(maxY-minY)*scale)/2
      const value=strokes.current.map(stroke=>stroke.map(p=>[Math.round((left+(p[0]-minX)*scale)*10)/10,Math.round((top+(p[1]-minY)*scale)*10)/10]))
      validateSignature(value);onDone(value);close()
    }catch(e){setError(e instanceof Error?e.message:'Kontrolli allkirja.')}
  }
  return <>
    <button type="button" disabled={disabled} className="button secondary wide" onClick={open}>{hasSignature?'Joonista allkiri uuesti':'Allkirjasta suurel ekraanil'}</button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={title} onCancel={e=>{e.preventDefault();close()}}>
      <div className={styles.layout}>
        <header className={styles.header}><button type="button" className="button secondary" onClick={close}>Tagasi</button><h2 id={title}>Tellija allkiri</h2></header>
        <svg ref={surface} className={styles.surface} viewBox={`0 0 600 ${height}`} preserveAspectRatio="none" role="img" aria-label="Joonista sõrmega allkiri"
          onPointerDown={e=>{if(pointer.current!==null||!e.isPrimary)return;e.preventDefault();pointer.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);strokes.current=[...strokes.current,[point(e)]];setDraft(strokes.current);setError('')}}
          onPointerMove={e=>{if(pointer.current!==e.pointerId)return;e.preventDefault();if(strokes.current.flat().length>=10000)return;const next=[...strokes.current];next[next.length-1]=[...next[next.length-1],point(e)];strokes.current=next;setDraft(next)}}
          onPointerUp={e=>{if(pointer.current===e.pointerId)pointer.current=null}} onPointerCancel={e=>{if(pointer.current===e.pointerId)pointer.current=null}} onLostPointerCapture={e=>{if(pointer.current===e.pointerId)pointer.current=null}}>
          {draft.map((stroke,i)=><polyline key={i} points={stroke.map(p=>p.join(',')).join(' ')} fill="none" stroke="#111827" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>)}
        </svg>
        {error&&<p role="alert" className={styles.error}>{error}</p>}
        <footer className={styles.footer}><button type="button" className="button secondary" onClick={()=>{strokes.current=[];setDraft([]);setError('')}}>Tühjenda</button><button type="button" className="button primary" disabled={!draft.length} onClick={done}>Valmis</button></footer>
      </div>
    </dialog>
  </>
}
