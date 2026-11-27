import { requireUser } from '@/lib/session'
import { tallinnDate, validDate } from '@/lib/payroll'
import { getDispatchReferences, getPricingSettings } from '@/lib/queries'
import { getWorkDay } from '@/lib/work-day-queries'
import Link from 'next/link'
import { getJobDetail } from '@/lib/queries'
import { getJobSeries } from '@/lib/job-series-queries'
import { createClient } from '@/lib/supabase/server'
import { nextWorkDate } from '@/lib/job-series'
import { WorkDayForm } from '@/components/WorkDayForm'

export default async function NewJobPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  await requireUser('manager')
  const query=await searchParams
  const sourceId=typeof query.continue==='string'?query.continue:null
  const source=sourceId?await getJobDetail(sourceId):null
  const series=source?await getJobSeries(source):null
  const date=typeof query.date==='string'&&validDate(query.date)?query.date:source?nextWorkDate(series?.jobs.at(-1)?.planned_date||source.planned_date):tallinnDate()
  const sourceData=source?await getWorkDay(source.planned_date):null
  if(source&&series) {
    const db=await createClient()
    const {data:sheet,error}=await db.from('job_delivery_sheets').select('id').eq('job_id',series.rootId).maybeSingle()
    if(error) throw error
    if(sheet) return <div className="page narrow stack"><h1>Saateleht on juba allkirjastatud</h1><p>Allkirjastatud lehele päevi juurde ei lisata. Uue töö jaoks lisa eraldi tööpäev.</p><Link className="button secondary" href="/manager/jobs/new">Lisa uus töö</Link></div>
  }
  const [data,refs,pricing]=await Promise.all([getWorkDay(date),getDispatchReferences(),getPricingSettings()])
  return <div className="page day-page stack-lg"><div><p className="eyebrow">Tööplaan</p><h1>{source?'Lisa järgmine päev':'Lisa tööpäevale'}</h1>{source&&<p>{source.address} · Iga päeva tunnid eraldi, saateleht ühine.</p>}</div>
    <form action="/manager/jobs/new" className="day-date-picker">{sourceId&&<input type="hidden" name="continue" value={sourceId}/>}<label>Kuupäev<input name="date" type="date" required min="2000-01-01" max="2099-12-31" defaultValue={date}/></label><button className="button secondary">Ava päev</button></form>
    <WorkDayForm key={`${date}-${data.day?.revision??0}`} data={data} pricing={pricing} {...refs} requestId={crypto.randomUUID()} newJobId={crypto.randomUUID()} continuation={source&&sourceData?{job:source,data:sourceData}:undefined}/>
  </div>
}
