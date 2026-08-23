import Link from 'next/link'
import { getSharedLiftCalendar } from '@/lib/queries'
import { freeCapacityDays } from '@/lib/dashboard'
import { formatPlannedTime } from '@/lib/jobs'
import { StatusBadge } from '@/components/StatusBadge'
import type { JobStatus } from '@/lib/domain'
import { claimJob } from '@/app/operator/actions'

function tallinnDateKey(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Tallinn',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value)
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function jobDateKey(job: any): string | null {
  if (job.planned_date) return job.planned_date
  if (!job.start_planned) return null
  return tallinnDateKey(new Date(job.start_planned))
}

function longDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('et-EE', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

export default async function WorkerCalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const jobs = await getSharedLiftCalendar()
  const requestedDate = Array.isArray(params.date) ? params.date[0] : params.date
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(requestedDate ?? '')) ? String(requestedDate) : tallinnDateKey()
  const view = ['day', 'week', 'month'].includes(String(params.view)) ? String(params.view) : 'week'
  const endDate = addDays(selectedDate, view === 'day' ? 0 : view === 'week' ? 6 : 30)

  const freeDays = freeCapacityDays(jobs.map((job: any) => ({
    start_planned: job.start_planned,
    end_planned: job.end_planned,
    status: job.status as JobStatus,
  })))

  const visible = jobs.filter((job: any) => {
    const date = jobDateKey(job)
    return Boolean(date && date >= selectedDate && date <= endDate)
  })

  const groups = new Map<string, any[]>()
  for (const job of visible) {
    const date = jobDateKey(job)
    if (date) groups.set(date, [...(groups.get(date) ?? []), job])
  }

  return <div className="page stack-lg operator-page">
    <div><p className="eyebrow">Kasutaja</p><h1>Kalender</h1><p className="muted">Ühe tõstuki ühine tööplaan. Kõik näevad sama hõivatust.</p></div>

    <section>
      <div className="section-title"><h2>Vabad aknad · 7 päeva</h2></div>
      <div className="capacity-row">{freeDays.length ? freeDays.map((day) => <Link key={day.date} className="capacity-chip" href={`/operator/calendar?view=day&date=${day.date}`}>
        <strong>{new Date(`${day.date}T12:00:00Z`).toLocaleDateString('et-EE', { weekday: 'short', day: 'numeric', month: 'numeric' })}</strong>
        <span>{day.freeHours} h vaba</span>
      </Link>) : <div className="empty">Järgmise 7 päeva tööpäevad on täis.</div>}</div>
    </section>

    <div className="segmented">
      <Link className={view === 'day' ? 'active' : ''} href={`?view=day&date=${selectedDate}`}>Päev</Link>
      <Link className={view === 'week' ? 'active' : ''} href={`?view=week&date=${selectedDate}`}>Nädal</Link>
      <Link className={view === 'month' ? 'active' : ''} href={`?view=month&date=${selectedDate}`}>Kuu</Link>
    </div>

    <div className="calendar-list">{[...groups.entries()].map(([date, dayJobs]) => <section key={date}>
      <h2>{longDate(date)}</h2>
      <div className="job-list">{dayJobs.map((job: any) => <div className="job-card" key={job.id}>
        <div className="job-card-top"><strong>{formatPlannedTime(job.start_planned, job.planned_time)} · {job.object_name || job.customer_name || 'Töö'}</strong><StatusBadge status={job.status as JobStatus} /></div>
        <div className="job-address">{job.address || 'Aadress määramata'}</div>
        <div className="job-meta"><span>{job.work_type_name || 'Tööliik määramata'}</span></div>
        {job.is_free ? <form action={claimJob} className="top-gap"><input type="hidden" name="id" value={job.id} /><button className="button primary wide" type="submit">VÕTA TÖÖ</button></form> : job.is_mine ? <Link className="button secondary wide top-gap" href={`/operator/jobs/${job.id}`}>Ava töö</Link> : <div className="job-meta"><span>Hõivatud</span></div>}
      </div>)}</div>
    </section>)}{visible.length === 0 && <div className="empty">Selles vaates töid ei ole.</div>}</div>
  </div>
}
