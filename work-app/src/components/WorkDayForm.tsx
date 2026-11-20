'use client'
import Link from 'next/link'
import { payrollRateForDate } from '@/lib/payroll-rates'
import type { PriceSettings } from '@/lib/domain'
import { CustomerPriceFields } from '@/components/CustomerPriceFields'
import { customerPrice, defaultCustomerPricing, initialCustomerPricing, type CustomerPricing } from '@/lib/customer-pricing'
import { startTransition, useActionState, useState } from 'react'
import { saveWorkDay } from '@/app/manager/time/day-actions'
import { calculateTime, euros, hours, parseRate, totals, wageCents, type ActionState } from '@/lib/payroll'
import { visibleDispatchSites, type DispatchEmployee, type DispatchSite } from '@/lib/simple-dispatch'
import { applySharedTime, dayDefaults, dayExpected, initialWorkers, timePayload, type DayData, type TimeDraft, type WorkerDraft } from '@/lib/work-days'

type JobDraft={payer_name:string;id:string;address:string;planned_time:string;planned_end_time:string;contact_phone:string;description:string;driver_employee_id:string;site_id:string;customer_pricing:CustomerPricing}
function TimeInputs({value,onChange,prefix}:{value:TimeDraft;onChange:(value:TimeDraft)=>void;prefix:string}) {
  return <><div className="form-grid two"><label>{prefix} algus<input type="time" required value={value.start} onChange={e=>onChange({...value,start:e.target.value})}/></label><label>{prefix} lõpp<input type="time" required value={value.end} onChange={e=>onChange({...value,end:e.target.value})}/></label></div>
    <details><summary>Paus ja öötöö{Number(value.pause)>0?` · ${value.pause} min`:''}{value.overnight?' · järgmine päev':''}</summary><div className="form-grid two top-gap"><label>Tasustamata paus, min<input type="number" min={0} max={1439} value={value.pause} onChange={e=>onChange({...value,pause:e.target.value})}/></label><label className="check-row"><input type="checkbox" checked={value.overnight} onChange={e=>onChange({...value,overnight:e.target.checked})}/> Lõpp järgmisel päeval</label></div></details></>
}
function SavedAddress({sites,onChoose}:{sites:DispatchSite[];onChoose:(site:DispatchSite)=>void}) {
  const [search,setSearch]=useState(''),[neste,setNeste]=useState(false)
  return <details><summary>Vali salvestatud aadress</summary><div className="stack top-gap"><input aria-label="Otsi aadressi" placeholder="Otsi aadressi" value={search} onChange={e=>setSearch(e.target.value)}/><label className="check-row"><input type="checkbox" checked={neste} onChange={e=>setNeste(e.target.checked)}/> Näita Neste aadresse</label><select aria-label="Salvestatud aadress" value="" onChange={e=>{const site=sites.find(s=>s.id===e.target.value);if(site) onChoose(site)}}><option value="">Vali aadress</option>{visibleDispatchSites(sites,neste,search).map(s=><option key={s.id} value={s.id}>{s.address||s.name}</option>)}</select></div></details>
}
export function WorkDayForm({data,employees,sites,requestId,newJobId,pricing}:{data:DayData;employees:DispatchEmployee[];sites:DispatchSite[];requestId:string;newJobId?:string;pricing:PriceSettings}) {
  const [date,setDate]=useState(data.date)
  const [state,action,pending]=useActionState(saveWorkDay,{} as ActionState)
  const [initialSchedule]=useState(()=>{
    const workers=initialWorkers(data)
    const day=dayDefaults(data)
    // A single worker's saved effective time is the whole paid day. Keep their
    // exact hours and pause, without showing the same day as a separate override.
    if(workers.length===1&&workers[0].override) {
      const {start,end,pause,overnight}=workers[0]
      return {day:{start,end,pause,overnight},workers:[{...workers[0],override:false}]}
    }
    return {day,workers}
  })
  const [shared,setShared]=useState(initialSchedule.day),[workerDrafts,setWorkers]=useState(initialSchedule.workers)
  const blank=(id:string):JobDraft=>({id,payer_name:'',address:'',planned_time:'',planned_end_time:'',contact_phone:'',description:'',driver_employee_id:'',site_id:'',customer_pricing:defaultCustomerPricing(pricing)})
  const [jobs,setJobs]=useState<JobDraft[]>(()=>[...data.jobs.map(j=>({id:j.id,payer_name:j.payer_name??'',address:j.address??'',planned_time:j.planned_time?.slice(0,5)??'',planned_end_time:j.planned_end_time?.slice(0,5)??'',contact_phone:j.contact_phone??'',description:j.description??'',driver_employee_id:j.driver_employee_id??'',site_id:j.site_id??'',customer_pricing:initialCustomerPricing(j,pricing)})),...(newJobId?[blank(newJobId)]:[])])
  const workers=workerDrafts
  const [localError,setLocalError]=useState('')
  const [draftRequest]=useState(requestId)
  const [expected]=useState(()=>dayExpected(data))
  const updateJob=(id:string,patch:Partial<JobDraft>)=>setJobs(list=>list.map(j=>j.id===id?{...j,...patch}:j))
  const updateWorker=(id:string,patch:Partial<WorkerDraft>)=>setWorkers(list=>list.map(w=>w.id===id?{...w,...patch}:w))
  const workerName=(w:WorkerDraft)=>w.is_new?w.name||'Uus tööline':employees.find(e=>e.id===w.id)?.name??'Tööline'
  const rate=(w:WorkerDraft)=>w.is_new?parseRate(w.rate??''):payrollRateForDate(employees.find(e=>e.id===w.id)??{hourly_rate_cents:0},date,date===data.date?data.entries.find(e=>e.employee_id===w.id)?.hourly_rate_cents:undefined)
  let error='',preview:{id:string;name:string;minutes:number;cents:number}[]=[]
  try {timePayload(shared);preview=workers.map(w=>{const v=w.override?w:shared;const minutes=calculateTime(v.start,v.end,v.pause,v.overnight).paidMinutes;return {id:w.id,name:workerName(w),minutes,cents:wageCents(minutes,rate(w))}})} catch(e) {error=(e as Error).message}
  let pricingError=''
  try {for(const j of jobs) customerPrice(j.customer_pricing,j.planned_time,j.planned_end_time)} catch(e){pricingError=(e as Error).message}
  const before=totals(data.entries),after=preview.reduce((s,w)=>s+w.cents,0)
  const running=data.entries.filter(e=>e.end_minute===null)
  return <form action={action} onSubmit={e=>{
    e.preventDefault();setLocalError('')
    try {
      for(const j of jobs) customerPrice(j.customer_pricing,j.planned_time,j.planned_end_time)
      const payload={requestId:draftRequest,expected,day:timePayload(shared),jobs,workers:workers.map(w=>({id:w.id,override:w.override,...timePayload(w.override?w:shared),...(w.is_new?{is_new:true,name:w.name,hourly_rate_cents:rate(w)}:{})}))}
      const form=new FormData();form.set('date',data.date);form.set('targetDate',date);form.set('payload',JSON.stringify(payload));startTransition(()=>action(form))
    } catch(err){setLocalError((err as Error).message)}
  }} className="stack-lg">
    <fieldset disabled={pending} className="payroll-fields stack-lg">
      <section id="day-times" className="form-card stack day-times"><div><h2>Päeva ajad</h2><p className="muted">Üks tööpäeva algus ja lõpp palgaarvestusse. Objektide ajad on ainult tellijale.</p></div>{!newJobId&&<label>Kuupäev<input type="date" required min="2000-01-01" max="2099-12-31" value={date} onChange={e=>setDate(e.target.value)}/></label>}{date!==data.date&&<p className="muted">Salvestamisel liiguvad kõik selle päeva objektid ja palgatunnid valitud kuupäevale.</p>}<TimeInputs prefix="Tööpäeva" value={shared} onChange={value=>{setShared(value);setWorkers(list=>applySharedTime(list,value))}}/>

        {!!workers.length&&<div className="stack day-time-overrides">{workers.map(w=>{
          const value=w.override?w:shared
          const row=preview.find(p=>p.id===w.id)
          return <div className="day-time-worker" key={w.id}><strong>{workerName(w)}</strong><span>{value.start}–{value.end}{value.overnight?' (+1 päev)':''} · {row?hours(row.minutes):'Kontrolli aega'}</span>
            <label className="check-row compact"><input type="checkbox" checked={w.override} onChange={e=>updateWorker(w.id,{...shared,override:e.target.checked})}/> Eraldi päev</label>
            {w.override&&<div className="stack day-time-worker-edit"><TimeInputs prefix={workerName(w)} value={w} onChange={value=>updateWorker(w.id,value)}/><button className="text-button" type="button" onClick={()=>updateWorker(w.id,{...shared,override:false})}>Kasuta ühist tööpäeva</button></div>}
          </div>
        })}</div>}
        <div className="day-team-heading"><h3>Objektide ajad tellijale</h3><button type="button" className="button secondary" onClick={()=>setJobs(list=>[...list,blank(crypto.randomUUID())])}>+ Lisa objekt</button></div>
        <div className="day-time-list">{jobs.map((j,index)=><div className="day-time-object" key={j.id}>
          <a href={`#job-${j.id}`} className="day-time-address">{index+1}. {j.address||'Uus objekt — täida aadress allpool'}</a>
          <label>Tellijale algus<input aria-label={`Objekt ${index+1} tellija algus`} type="time" value={j.planned_time} onChange={e=>updateJob(j.id,{planned_time:e.target.value})}/></label>
          <label>Tellijale lõpp<input aria-label={`Objekt ${index+1} tellija lõpp`} type="time" value={j.planned_end_time} onChange={e=>updateJob(j.id,{planned_end_time:e.target.value})}/></label>
          <label className="day-time-driver">Juht<select aria-label={`Objekt ${index+1} juht`} value={j.driver_employee_id} onChange={e=>{
            const id=e.target.value
            if(id)setWorkers(list=>list.some(w=>w.id===id)?list:[...list,{id,...shared,override:false}])
            updateJob(j.id,{driver_employee_id:id})
          }}><option value="">Määran hiljem</option>{employees.filter(e=>e.active||workers.some(w=>w.id===e.id)).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}{workers.filter(w=>w.is_new).map(w=><option key={w.id} value={w.id}>{workerName(w)}</option>)}</select></label>
        </div>)}</div>
        {!jobs.length&&<p className="muted">Lisa päeva esimene objekt.</p>}
        <details><summary>Muuda meeskonda · {workers.length} töölist</summary><div className="stack top-gap">
        <div className="day-team-heading"><h3>Meeskond</h3><button type="button" className="text-button" onClick={()=>setWorkers(list=>[...list,{id:crypto.randomUUID(),...shared,override:false,is_new:true,name:'',rate:''}])}>+ Uus tööline</button></div>
        <div className="day-worker-choices">{employees.filter(e=>e.active||workers.some(w=>w.id===e.id)).map(e=><label className={`day-worker-chip ${workers.some(w=>w.id===e.id)?'selected':''}`} key={e.id}><input type="checkbox" checked={workers.some(w=>w.id===e.id)} onChange={event=>{
          if(event.target.checked) setWorkers(list=>[...list,{id:e.id,...shared,override:false}]);else {setWorkers(list=>list.filter(w=>w.id!==e.id));setJobs(list=>list.map(j=>j.driver_employee_id===e.id?{...j,driver_employee_id:''}:j))}
        }}/>{e.name}</label>)}</div>
        {workers.filter(w=>w.is_new).map(w=><div className="day-new-worker stack" key={w.id}><div className="form-grid two"><label>Uue töölise nimi<input required maxLength={120} value={w.name} onChange={e=>updateWorker(w.id,{name:e.target.value})}/></label><label>Tunnihind, €/h<input required inputMode="decimal" value={w.rate} onChange={e=>updateWorker(w.id,{rate:e.target.value})}/></label></div><button type="button" className="text-button" onClick={()=>{setWorkers(list=>list.filter(x=>x.id!==w.id));setJobs(list=>list.map(j=>j.driver_employee_id===w.id?{...j,driver_employee_id:''}:j))}}>Eemalda uus tööline</button></div>)}

        </div></details>
        <div className="day-team-heading"><strong>{error||`Palgakulu kokku ${euros(after)}`}</strong><button className="button primary" disabled={pending||!!error||!!pricingError||!!running.length}>{pending?'Salvestan…':'Salvesta päev'}</button></div>
        {(state.error||localError||pricingError)&&<p className="alert danger" role="alert">{state.error||localError||pricingError}</p>}

      </section>
      <section className="stack"><div className="day-team-heading"><div><h2>Objektid <span className="count">{jobs.length}</span></h2><p className="muted">Tööajad tellijale. Need ei lisa palgale tunde teist korda.</p></div><button type="button" className="button secondary" onClick={()=>setJobs(list=>[...list,blank(crypto.randomUUID())])}>+ Lisa objekt</button></div>
        {jobs.map((j,index)=><details className="form-card day-object" key={j.id} id={`job-${j.id}`} open={!data.jobs.some(old=>old.id===j.id)}><summary>Objekt {index+1} · {j.address||'Uus objekt'}</summary><div className="stack top-gap"><div className="day-team-heading"><h3>Objekt {index+1}</h3>{!data.jobs.some(old=>old.id===j.id)&&<button type="button" className="text-button" onClick={()=>setJobs(list=>list.filter(x=>x.id!==j.id))}>Eemalda</button>}</div>
          <label>Aadress<input required maxLength={500} value={j.address} placeholder="Tänav, maja, linn" onChange={e=>updateJob(j.id,{address:e.target.value,site_id:''})}/></label>
          <label>Arve saaja / maksja (vabatahtlik)<input maxLength={200} value={j.payer_name} placeholder="Ettevõtte või inimese nimi" onChange={e=>updateJob(j.id,{payer_name:e.target.value})}/></label>
          <SavedAddress sites={sites} onChoose={s=>updateJob(j.id,{address:s.address||s.name,site_id:s.id})}/>
          <p className="muted">Tellija aeg: {j.planned_time||'—'}–{j.planned_end_time||'—'} · Juht: {workers.find(w=>w.id===j.driver_employee_id)?workerName(workers.find(w=>w.id===j.driver_employee_id)!):'määramata'} · <a href="#day-times">Muuda päeva ajakavas ↑</a></p>
          <label>Tellija telefon<input type="tel" maxLength={50} value={j.contact_phone} onChange={e=>updateJob(j.id,{contact_phone:e.target.value})}/></label>
          <CustomerPriceFields value={j.customer_pricing} start={j.planned_time} end={j.planned_end_time} onChange={value=>updateJob(j.id,{customer_pricing:value})}/>
          <label>Töö kirjeldus<textarea rows={2} maxLength={2000} value={j.description} onChange={e=>updateJob(j.id,{description:e.target.value})}/></label>
        </div></details>)}
      </section>
      <section className="detail-card stack"><h2>Palgaarvestusse</h2>{error?<p>{error}</p>:<><div className="day-team-heading"><span>{workers.length} töölist · {jobs.length} objekti</span><strong>{euros(after)}</strong></div>{preview.map(w=><div className="day-pay-row" key={w.id}><span>{w.name}{workers.find(worker=>worker.id===w.id)?.override&&<small> · eraldi tööaeg</small>}</span><span>{hours(w.minutes)}</span><strong>{euros(w.cents)}</strong></div>)}</>}
        {data.entries.length>0&&<p className="muted">Praegu kirjas {euros(before.cents)}. Salvestamisel asenduvad selle päeva tunnid ülal näidatud aegadega. Maksete ajalugu säilib.</p>}
        {!workers.length&&<p className="muted">Meeskond on määramata. Objektid salvestatakse, palgakandeid ei lisata.</p>}
        {running.length>0&&<div className="alert danger">Lõpeta esmalt käimasolevad tööajad.{running.map(e=><p key={e.id}><Link href={`/manager/time/entries/${e.id}`}>Ava {employees.find(w=>w.id===e.employee_id)?.name??'töölise'} tööaeg</Link></p>)}</div>}
        <div className="form-grid two"><Link className="button secondary" href="/manager">Tagasi tööde juurde</Link><button className="button primary" disabled={pending||!!error||!!pricingError||!!running.length}>{pending?'Salvestan…':'Salvesta päev'}</button></div>
      </section>
    </fieldset>{(state.error||localError)&&<p className="alert danger" role="alert">{state.error||localError}</p>}
  </form>
}
