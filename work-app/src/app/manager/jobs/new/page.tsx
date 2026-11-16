import { requireUser } from '@/lib/session'
import { tallinnDate, validDate } from '@/lib/payroll'
import { getDispatchReferences } from '@/lib/queries'
import { getWorkDay } from '@/lib/work-day-queries'
import { WorkDayForm } from '@/components/WorkDayForm'

export default async function NewJobPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  await requireUser('manager')
  const query=await searchParams
  const date=typeof query.date==='string'&&validDate(query.date)?query.date:tallinnDate()
  const [data,refs]=await Promise.all([getWorkDay(date),getDispatchReferences()])
  return <div className="page day-page stack-lg"><div><p className="eyebrow">Tööplaan</p><h1>Lisa tööpäevale</h1></div>
    <form action="/manager/jobs/new" className="day-date-picker"><label>Kuupäev<input name="date" type="date" required min="2000-01-01" max="2099-12-31" defaultValue={date}/></label><button className="button secondary">Ava päev</button></form>
    <WorkDayForm key={`${date}-${data.day?.revision??0}`} data={data} {...refs} requestId={crypto.randomUUID()} newJobId={crypto.randomUUID()}/>
  </div>
}
