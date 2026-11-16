import type { PriceSettings } from './domain.ts'
import { timeMinute } from './simple-dispatch.ts'

/** Customer charges, in cents/minutes. Independent of employees' wage entries. */
export type CustomerPricing = {
  version:1; lift_enabled:boolean; operator_work:boolean; helper_count:number
  lift_rate:number; driver_rate:number; operator_rate:number; helper_rate:number; minimum:number
  billed_minutes:number|null; operator_minutes:number|null; helper_minutes:number|null
  drive_minutes:number; drive_rate:number; km:number; km_rate:number
  adjustment:number; agreed_total:number|null
}
export type PricingJob = {
  customer_pricing?:CustomerPricing|null; price_snapshot_json?:Partial<PriceSettings>|null
  estimated_total?:number|null; estimated_hours?:number|null; estimated_drive_hours?:number|null
  estimated_km?:number|null; estimated_helper_hours?:number|null; manual_adjustment?:number|null
  operator_does_work?:boolean; operator_work_hourly_rate?:number|null
}
export const cents=(euros:number)=>Math.round(euros*100)
export function defaultCustomerPricing(settings:PriceSettings):CustomerPricing {
  return {version:1,lift_enabled:true,operator_work:false,helper_count:0,lift_rate:cents(settings.hourlyRate),
    driver_rate:cents(settings.driverHourlyRate??0),operator_rate:cents(settings.operatorWorkHourlyRate??15),
    helper_rate:cents(settings.helperHourlyRate),minimum:cents(settings.minimumOrder),billed_minutes:null,
    operator_minutes:null,helper_minutes:null,drive_minutes:0,drive_rate:cents(settings.driveHourlyRate),km:0,
    km_rate:cents(settings.kmRate),adjustment:0,agreed_total:null}
}
export function initialCustomerPricing(job:PricingJob,settings:PriceSettings):CustomerPricing {
  if(job.customer_pricing) return {...job.customer_pricing}
  const p=defaultCustomerPricing({...settings,...job.price_snapshot_json})
  // Imported or previously agreed quotes remain exact until the manager chooses recalculation.
  if(job.estimated_total!=null) {
    p.agreed_total=cents(Number(job.estimated_total))
    if(Number(job.estimated_hours)>0) p.billed_minutes=Math.round(Number(job.estimated_hours)*60)
  }
  p.operator_work=job.operator_does_work===true
  if(job.operator_work_hourly_rate!=null) p.operator_rate=cents(Number(job.operator_work_hourly_rate))
  p.drive_minutes=Math.round(Number(job.estimated_drive_hours??0)*60)
  p.km=Number(job.estimated_km??0);p.adjustment=cents(Number(job.manual_adjustment??0))
  if(Number(job.estimated_helper_hours)>0) {p.helper_count=1;p.helper_minutes=Math.round(Number(job.estimated_helper_hours)*60)}
  return p
}
export function appointmentMinutes(start:string,end:string):number|null {
  const a=timeMinute(start.slice(0,5)),b=timeMinute(end.slice(0,5))
  return a===null||b===null||b<=a?null:b-a
}
export function validateCustomerPricing(p:CustomerPricing) {
  const integer=(n:unknown,max:number,min=0)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max
  if(p.version!==1||typeof p.lift_enabled!=='boolean'||typeof p.operator_work!=='boolean') throw new Error('Kontrolli hinnastamise valikuid.')
  for(const value of [p.lift_rate,p.driver_rate,p.operator_rate,p.helper_rate,p.drive_rate,p.km_rate])
    if(!integer(value,999999)) throw new Error('Ühikuhind peab olema 0–9999,99 €.')
  if(!integer(p.minimum,999999999)||!integer(p.adjustment,999999999,-999999999)||
    (p.agreed_total!==null&&!integer(p.agreed_total,999999999))) throw new Error('Kontrolli kokkuleppehinda ja miinimumtasu.')
  if(!integer(p.helper_count,50)||!integer(p.drive_minutes,1440)) throw new Error('Kontrolli abiliste arvu ja sõiduaega.')
  for(const value of [p.billed_minutes,p.operator_minutes,p.helper_minutes])
    if(value!==null&&!integer(value,1440,1)) throw new Error('Arvestatav aeg peab olema 1–1440 minutit.')
  if(!Number.isFinite(p.km)||p.km<0||p.km>10000||Math.abs(p.km*100-Math.round(p.km*100))>1e-6) throw new Error('Kilometraaž peab olema 0–10 000 km, kuni kahe komakohaga.')
}
export function customerPrice(p:CustomerPricing,start:string,end:string) {
  validateCustomerPricing(p)
  const actualMinutes=appointmentMinutes(start,end),minutes=p.billed_minutes??actualMinutes
  const amount=(m:number|null,rate:number,count=1)=>Math.round((m??0)*rate*count/60)
  const lift=p.lift_enabled?amount(minutes,p.lift_rate):0,driver=amount(minutes,p.driver_rate)
  const operator=p.operator_work?amount(p.operator_minutes??minutes,p.operator_rate):0
  const helper=amount(p.helper_minutes??minutes,p.helper_rate,p.helper_count)
  const drive=amount(p.drive_minutes,p.drive_rate),distance=Math.round(p.km*p.km_rate)
  const base=lift+driver+helper+drive+distance+p.adjustment
  const minimumTopUp=Math.max(0,p.minimum-base)
  const calculated=minutes===null?null:Math.max(p.minimum,base)+operator
  const total=p.agreed_total??calculated
  if(total!==null&&total>999999999) throw new Error('Objekti hind ületab lubatud piiri.')
  return {actualMinutes,minutes,lift,driver,operator,helper,drive,distance,minimumTopUp,calculated,total}
}
