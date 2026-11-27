import { customerPrice, initialCustomerPricing, type PricingJob } from './customer-pricing.ts'
import type { PriceSettings } from './domain.ts'

export type SheetInput = { date:string; start:string; end:string; nextDay:boolean; transport:'city'|'km'; km:number; operatorWork:boolean; customer:string; billingAddress:string; contact:string; email:string; signer:string }
export type Signature = number[][][]
export type SheetJob = PricingJob & { id:string; updated_at?:string; planned_date?:string; planned_time?:string; planned_end_time?:string; payer_name?:string; object_name?:string; address?:string; contact_phone?:string; description?:string; customer?:{name?:string; billing_address?:string; phone?:string; email?:string}; vehicle?:{registration_number?:string} }
export function sheetDefaults(job:SheetJob):SheetInput {
  return {date:job.planned_date??'',start:job.planned_time?.slice(0,5)??'',end:job.planned_end_time?.slice(0,5)??'',nextDay:false,
    transport:(job.customer_pricing?.km??job.estimated_km??0)>0?'km':'city',km:Number(job.customer_pricing?.km??job.estimated_km??0),operatorWork:job.customer_pricing?.operator_work??job.operator_does_work??false,
    customer:job.payer_name||job.customer?.name||'',billingAddress:job.customer?.billing_address??'',contact:job.contact_phone||job.customer?.phone||'',email:job.customer?.email??'',signer:''}
}
export function validateSheetInput(value:unknown):SheetInput {
  if(!value||typeof value!=='object') throw new Error('Kontrolli saatelehe andmeid.')
  const v=value as SheetInput
  for(const k of ['customer','billingAddress','contact','email','signer'] as const) if(typeof v[k]!=='string'||v[k].length>300) throw new Error('Kontrolli tellija andmeid.')
  if(!v.customer.trim()||!v.signer.trim()) throw new Error('Sisesta tellija ja allkirjastaja nimi.')
  if(typeof v.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v.date)||!Number.isFinite(Date.parse(v.date))||new Date(v.date).toISOString().slice(0,10)!==v.date) throw new Error('Kontrolli kuupäeva.')
  if(![v.start,v.end].every(s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s))||typeof v.nextDay!=='boolean'||typeof v.operatorWork!=='boolean') throw new Error('Sisesta tegelik töö algus ja lõpp.')
  if(!['city','km'].includes(v.transport)||!Number.isFinite(v.km)||v.km<0||v.km>10000||Math.abs(v.km*100-Math.round(v.km*100))>1e-6||(v.transport==='km'&&v.km<=0)) throw new Error('Sisesta edasi-tagasi kilomeetrid.')
  return {date:v.date,start:v.start,end:v.end,nextDay:v.nextDay,transport:v.transport,km:v.transport==='km'?v.km:0,operatorWork:v.operatorWork,customer:v.customer.trim(),billingAddress:v.billingAddress.trim(),contact:v.contact.trim(),email:v.email.trim(),signer:v.signer.trim()}
}
export function deliverySnapshot(job:SheetJob,settings:PriceSettings,raw:unknown) {
  const input=validateSheetInput(raw)
  const minute=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3))
  const minutes=minute(input.end)-minute(input.start)+(input.nextDay?1440:0)
  if(minutes<=0||minutes>1440) throw new Error('Töö lõpp peab olema pärast algust (kuni 24 tundi).')
  const p=initialCustomerPricing(job,settings)
  p.billed_minutes=minutes;p.operator_minutes=minutes;p.helper_minutes=minutes
  p.operator_work=input.operatorWork
  // One round trip: fixed city charge OR distance, never both.
  p.drive_minutes=input.transport==='city'?60:0;p.drive_rate=4500
  p.km=input.transport==='km'?input.km:0;p.km_rate=100
  const result=customerPrice(p,input.start,input.end)
  const rows:{label:string;unit:string;quantity:number;rate:number;amount:number}[]=[]
  const add=(label:string,unit:string,quantity:number,rate:number,amount:number)=>{if(amount) rows.push({label,unit,quantity,rate,amount})}
  add('Objektile ja tagasisõit',input.transport==='city'?'kmpl':'km',input.transport==='city'?1:input.km,input.transport==='city'?4500:100,result.drive+result.distance)
  add('Tõstukitööd','h',minutes/60,p.lift_rate,result.lift)
  add('Juht','h',minutes/60,p.driver_rate,result.driver)
  add('Operaator teostab tööd','h',minutes/60,p.operator_rate,result.operator)
  add('Abilised','inim-tund',minutes/60*p.helper_count,p.helper_rate,result.helper)
  add('Hinnakorrektsioon','kmpl',1,p.adjustment,p.adjustment)
  add('Miinimumtasu täitmine','kmpl',1,result.minimumTopUp,result.minimumTopUp)
  if(p.agreed_total!==null) { const correction=p.agreed_total-rows.reduce((s,r)=>s+r.amount,0);add('Kokkulepitud lõpphinna korrigeerimine','kmpl',1,correction,correction) }
  return {version:1,jobId:job.id,input,object:job.object_name||job.address||'',address:job.address||'',description:job.description||'',vehicle:job.vehicle?.registration_number||'543 CTJ',supplier:{name:'Euro Kapital OÜ',registry:'17401393',address:'Vikerlase 5-5, Tallinn',phone:'55567630'},minutes,pricing:p,rows,total:result.total!,sourceUpdatedAt:job.updated_at??null}
}
export type DailySnapshot=ReturnType<typeof deliverySnapshot>
export type DeliverySnapshot=DailySnapshot & {days?:DailySnapshot[]}
export type SheetDayInput=Pick<SheetInput,'date'|'start'|'end'|'nextDay'|'transport'|'km'|'operatorWork'> & {jobId:string}
/** Price each day with its existing pricing, then sum; never price the overnight gap. */
export function seriesDeliverySnapshot(jobs:SheetJob[],settings:PriceSettings,raw:unknown,rawDays:unknown,rootId:string):DeliverySnapshot {
  if(jobs.length===1&&!Array.isArray(rawDays)) return deliverySnapshot(jobs[0],settings,raw)
  if(!Array.isArray(rawDays)||rawDays.length!==jobs.length||new Set(rawDays.map(d=>d?.jobId)).size!==jobs.length) throw new Error('Saatelehel peavad olema kõik selle töö päevad ühe korra.')
  const common=raw as SheetInput
  const days=jobs.map(job=>{
    const day=rawDays.find(d=>d?.jobId===job.id)
    if(!day||day.date!==job.planned_date) throw new Error('Töö päevad on muutunud. Ava saateleht uuesti.')
    return deliverySnapshot(job,settings,{...common,date:day.date,start:day.start,end:day.end,nextDay:day.nextDay,transport:day.transport,km:day.km,operatorWork:day.operatorWork})
  })
  if(!days.length) throw new Error('Töö päevi ei leitud.')
  return {...days[0],version:2,jobId:rootId,days,minutes:days.reduce((n,d)=>n+d.minutes,0),total:days.reduce((n,d)=>n+d.total,0),
    rows:days.flatMap(d=>d.rows.map(row=>({...row,label:`${d.input.date.split('-').reverse().join('.')} · ${row.label}`})))}
}
export type SavedSheet={sheet_number:string;sheet_year:number;sheet_sequence:number;id:string; job_id:string;snapshot:DeliverySnapshot;signature:Signature;signed_at:string;created_by:string}
export function validateSignature(value:unknown):Signature {
  if(!Array.isArray(value)||value.length<1||value.length>100) throw new Error('Palun lisa tellija allkiri.')
  let count=0,distance=0
  for(const stroke of value) {
    if(!Array.isArray(stroke)||!stroke.length) throw new Error('Allkiri ei ole korrektne.')
    for(let i=0;i<stroke.length;i++) {
      const p=stroke[i];count++
      if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<0||p[0]>600||p[1]<0||p[1]>200||count>10000) throw new Error('Allkiri ei ole korrektne.')
      if(i) distance+=Math.hypot(p[0]-stroke[i-1][0],p[1]-stroke[i-1][1])
    }
  }
  if(count<3||distance<10) throw new Error('Palun joonista tellija allkiri.')
  return value as Signature
}

