type JobTime = { driver_employee_id:string; planned_time:string; planned_end_time:string }
export function driverDayWithTravel(jobs:JobTime[],driverId:string) {
  const assigned=jobs.filter(job=>job.driver_employee_id===driverId)
  if(!assigned.length) throw new Error('Määra juhile kõigepealt objekt.')
  const minute=(value:string)=>{
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Täida juhi kõigi objektide algus ja lõpp.')
    const [h,m]=value.split(':').map(Number)
    return h*60+m
  }
  const ranges=assigned.map(job=>{
    const start=minute(job.planned_time),end=minute(job.planned_end_time)
    if(start===end) throw new Error('Objekti algus ja lõpp peavad olema erinevad.')
    return {start,end:end<start?end+1440:end}
  })
  const start=Math.min(...ranges.map(r=>r.start))-45
  const end=Math.max(...ranges.map(r=>r.end))+45
  if(start<0||end-start>=1440) throw new Error('See sõiduaeg ületab tööpäeva piiri. Täpsusta juhi tööpäev käsitsi.')
  const clock=(n:number)=>String(Math.floor(n/60)%24).padStart(2,'0')+':'+String(n%60).padStart(2,'0')
  return {start:clock(start),end:clock(end),overnight:end>=1440}
}
