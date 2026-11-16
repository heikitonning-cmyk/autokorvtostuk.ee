import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/session'
import { validDate } from '@/lib/payroll'
import { dateLabel } from '@/lib/work-days'
import { getWorkDay } from '@/lib/work-day-queries'
import { getDispatchReferences } from '@/lib/queries'
import { WorkDayForm } from '@/components/WorkDayForm'
export default async function DayPage({params,searchParams}:{params:Promise<{date:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  await requireUser('manager')
  const {date}=await params
  if(!validDate(date)) notFound()
  const [data,refs,query]=await Promise.all([getWorkDay(date),getDispatchReferences(),searchParams])
  return <div className="page day-page stack-lg"><Link href="/manager/time?view=days" className="back-link">← Päevade juurde</Link><div className="page-title-row"><div><p className="eyebrow">Tööpäev</p><h1>{dateLabel(date)}</h1></div><Link className="button secondary" href={`/manager/jobs/new?date=${date}`}>+ Lisa töö</Link></div>
    {query.saved&&<p className="alert success" role="status">Päev, objektid ja tööliste palgaarvestus on salvestatud.</p>}
    <WorkDayForm key={`${data.day?.revision??0}-${data.entries.map(e=>e.updated_at).join()}`} data={data} {...refs} requestId={crypto.randomUUID()}/>
  </div>
}
