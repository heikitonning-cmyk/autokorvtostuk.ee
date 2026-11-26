import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getJobSeries } from '@/lib/job-series-queries'
import { DeliverySheetForm } from './DeliverySheetForm'
import type { SheetJob, SavedSheet } from '@/lib/delivery-sheet'

export async function JobDeliverySheet({job,manager=false}:{job:SheetJob&{status?:string;continuation_root_id?:string|null};manager?:boolean}) {
  const supabase=await createClient()
  const {rootId,jobs}=await getJobSeries(job)
  const {data,error}=await supabase.from('job_delivery_sheets').select('*').eq('job_id',rootId).maybeSingle()
  if(error) return <section className="detail-card"><h2>Saateleht</h2><p>Saatelehe laadimine ebaõnnestus. Palun värskenda lehte.</p></section>
  if(job.status==='tuhistatud'&&!data) return null
  const root=jobs.find(j=>j.id===rootId)??job
  return <>
    <section className="detail-card stack"><div className="day-team-heading"><h2>Töö päevad</h2>{manager&&!data&&<Link className="button secondary" href={`/manager/jobs/new?continue=${job.id}`}>+ Lisa järgmine päev</Link>}</div>
      {jobs.map(day=><div className="day-pay-row" key={day.id}><Link href={`/${manager?'manager':'operator'}/jobs/${day.id}`}>{day.planned_date?.split('-').reverse().join('.')} · {day.planned_time?.slice(0,5)||'—'}–{day.planned_end_time?.slice(0,5)||'—'}</Link>{manager&&<Link href={`/manager/time/days/${day.planned_date}`}>Muuda tunde</Link>}</div>)}
      {jobs.length>1&&<p className="muted">Iga päeva palgatunnid on eraldi. Saatelehel on kõik {jobs.length} päeva koos.</p>}
      {manager&&data&&<small className="muted">Saateleht on allkirjastatud. Uue päeva jaoks lisa uus töö.</small>}
    </section>
    <DeliverySheetForm job={root} jobs={jobs} initial={data as SavedSheet|null}/>
  </>
}
