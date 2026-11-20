import type { PricingJob } from './customer-pricing.ts'
import { calculateTime, clock, type TimeEntry } from './payroll.ts'

export type WorkDay = { id:string; work_date:string; start_minute:number; end_minute:number; break_minutes:number; next_day:boolean; revision:number }
export type DayJob = PricingJob & { payer_name?:string|null; id:string; address:string|null; planned_date:string|null; planned_time:string|null; planned_end_time:string|null; contact_phone:string|null; description:string|null; driver_employee_id:string|null; site_id:string|null; updated_at:string; work_day_id?:string|null }
export type DayEntry = TimeEntry & { work_day_id:string|null; day_time_override:boolean; job_id:string|null }
export type DayData = { date:string; day:WorkDay|null; jobs:DayJob[]; entries:DayEntry[] }
export type TimeDraft = { start:string; end:string; pause:string; overnight:boolean }
export type WorkerDraft = TimeDraft & { id:string; override:boolean; is_new?:boolean; name?:string; rate?:string }
export const dateLabel = (date:string) => date.split('-').reverse().join('.')
export function timeDraft(time:{start_minute:number;end_minute:number|null;break_minutes:number;next_day:boolean}):TimeDraft {
  return {start:clock(time.start_minute),end:clock(time.end_minute??time.start_minute),pause:String(time.break_minutes),overnight:time.next_day}
}
export function dayDefaults(data:DayData):TimeDraft {
  if(data.day) return timeDraft(data.day)
  const entries=data.entries.filter(e=>e.end_minute!==null)
  if(!entries.length) return {start:'08:00',end:'15:00',pause:'0',overnight:false}
  const end=Math.max(...entries.map(e=>e.end_minute!+(e.next_day?1440:0)))
  return {start:clock(Math.min(...entries.map(e=>e.start_minute))),end:clock(end%1440),pause:String(Math.max(...entries.map(e=>e.break_minutes))),overnight:end>=1440}
}
export function initialWorkers(data:DayData):WorkerDraft[] {
  const shared=dayDefaults(data)
  const ids=[...new Set([...data.entries.map(e=>e.employee_id),...data.jobs.map(j=>j.driver_employee_id).filter((id):id is string=>!!id)])]
  return ids.map(id=>{
    const entries=data.entries.filter(e=>e.employee_id===id)
    if(!entries.length) return {id,...shared,override:false}
    if(data.day) return {id,...timeDraft(entries[0]),override:entries[0].day_time_override}
    const end=Math.max(...entries.map(e=>(e.end_minute??e.start_minute)+(e.next_day?1440:0)))
    const own={start:clock(Math.min(...entries.map(e=>e.start_minute))),end:clock(end%1440),pause:String(entries.reduce((s,e)=>s+e.break_minutes,0)),overnight:end>=1440}
    return {id,...own,override:JSON.stringify(own)!==JSON.stringify(shared)}
  })
}
export function timePayload(draft:TimeDraft) {
  const t=calculateTime(draft.start,draft.end,draft.pause,draft.overnight)
  return {start_minute:t.startMinute,end_minute:t.endMinute,break_minutes:t.breakMinutes,next_day:draft.overnight}
}
export function dayExpected(data:DayData) {
  const versions=(rows:{id:string;updated_at:string}[])=>rows.map(({id,updated_at})=>({id,updated_at}))
  return {revision:data.day?.revision??0,jobs:versions(data.jobs),entries:versions(data.entries)}
}

/** Editing the shared day intentionally reapplies its time to every selected worker. */
export function applySharedTime(workers:WorkerDraft[],shared:TimeDraft):WorkerDraft[] {
  return workers.map(worker=>({...worker,...shared,override:false}))
}
