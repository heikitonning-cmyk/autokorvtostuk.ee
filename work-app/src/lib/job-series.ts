import type { DayData } from './work-days.ts'
import { dayDefaults, initialWorkers } from './work-days.ts'

export function nextWorkDate(date:string) {
  const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1)
  return d.toISOString().slice(0,10)
}
/** Preserve the destination day's crew and schedule; seed an empty day from the source. */
export function continuationSchedule(target:DayData,source:DayData) {
  const occupied=!!target.day||target.entries.length>0||target.jobs.length>0
  const day=dayDefaults(occupied?target:source)
  const current=initialWorkers(target),copied=initialWorkers(source)
  return {day,workers:[...current,...copied.filter(w=>!current.some(c=>c.id===w.id)).map(w=>occupied?{id:w.id,...day,override:false}:w)]}
}
