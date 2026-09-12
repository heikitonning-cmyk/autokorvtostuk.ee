import Link from 'next/link'
import { getManagerJobs } from '@/lib/queries'
import { JobCard } from '@/components/JobCard'

function dateKey(value: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
}

function jobDateKey(job: any): string | null {
  if (job.planned_date) return job.planned_date
  return job.start_planned ? dateKey(job.start_planned) : null
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const view = ['day','week','month'].includes(String(params.view)) ? String(params.view) : 'week'
  const jobs = await getManagerJobs()
  const now = new Date()
  const days = view === 'day' ? 1 : view === 'week' ? 7 : 31
  const start = now.getTime() - 86400000
  const end = now.getTime() + days * 86400000
  const visible = jobs.filter((j: any) => {
    const key = jobDateKey(j)
    if (!key) return false
    const t = j.start_planned ? new Date(j.start_planned).getTime() : new Date(`${key}T12:00:00Z`).getTime()
    return t >= start && t <= end
  })
  const groups = new Map<string, any[]>()
  for (const job of visible) {
    const key = jobDateKey(job)
    if (key) groups.set(key, [...(groups.get(key) ?? []), job])
  }
  return <div className="page stack-lg"><div className="page-title-row"><div><p className="eyebrow">Kalender</p><h1>Tööde plaan</h1></div><Link className="button primary" href="/manager/jobs/new">+ Lisa töö</Link></div><div className="segmented"><Link className={view==='day'?'active':''} href="?view=day">Päev</Link><Link className={view==='week'?'active':''} href="?view=week">Nädal</Link><Link className={view==='month'?'active':''} href="?view=month">Kuu</Link></div><div className="calendar-list">{[...groups.entries()].map(([date, dayJobs]) => <section key={date}><h2>{new Date(`${date}T12:00:00Z`).toLocaleDateString('et-EE',{weekday:'long',day:'numeric',month:'long'})}</h2><div className="job-list">{dayJobs.map((job:any)=><JobCard key={job.id} job={job} href={`/manager/jobs/${job.id}`} />)}</div></section>)}{visible.length===0 && <div className="empty">Selles vaates töid ei ole.</div>}</div></div>
}
