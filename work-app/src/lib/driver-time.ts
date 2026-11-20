import {clock} from './payroll.ts'
import type {TimeDraft,WorkerDraft} from './work-days.ts'
export type DriverAppointment={driver_employee_id:string;planned_time:string;planned_end_time:string}
const minute=(v:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v)?Number(v.slice(0,2))*60+Number(v.slice(3,5)):null
/** One paid span per driver per day, never a separate wage entry for each object. */
export function suggestedDriverTime(jobs:DriverAppointment[],driverId:string):{time:TimeDraft|null;reason:string} {
 const own=jobs.filter(j=>j.driver_employee_id===driverId)
 if(!own.length)return {time:null,reason:'Vali objektile juht.'}
 const spans=own.map(j=>({start:minute(j.planned_time),end:minute(j.planned_end_time)}))
 if(spans.some(s=>s.start===null||s.end===null||s.end<=s.start))return {time:null,reason:'Automaatse juhi tööaja jaoks täida tema objektide tellija algus ja lõpp.'}
 const start=Math.min(...spans.map(s=>s.start!))-30,end=Math.max(...spans.map(s=>s.end!))+30
 if(start<0)return {time:null,reason:'Sõiduaeg algaks eelmisel päeval. Sisesta juhi tegelik tööaeg käsitsi.'}
 if(end-start>=1440)return {time:null,reason:'Täpsusta juhi tööaeg käsitsi: päev koos sõiduga on liiga pikk.'}
 return {time:{start:clock(start),end:clock(end%1440),pause:'0',overnight:end>=1440},reason:''}
}
export function driverWorkers(workers:WorkerDraft[],jobs:DriverAppointment[],manual:Record<string,boolean>,savedIds:string[]):WorkerDraft[] {
 return workers.map(w=>{
   if(manual[w.id]??savedIds.includes(w.id))return w
   const {time}=suggestedDriverTime(jobs,w.id)
   return time?{...w,...time,pause:w.pause,override:true}:w
 })
}
