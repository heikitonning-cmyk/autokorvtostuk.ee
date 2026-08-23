import Link from 'next/link'
import { requireView } from '@/lib/session'
import { getSharedLiftCalendar } from '@/lib/queries'
import { freeCapacityDays } from '@/lib/dashboard'
import { formatPlannedTime } from '@/lib/jobs'
import { StatusBadge } from '@/components/StatusBadge'
import type { JobStatus } from '@/lib/domain'
import { claimJob, releaseJob } from './actions'

function tallinnDateKey(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Tallinn',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value)
}

function jobDateKey(job: any): string | null {
  if (job.planned_date) return job.planned_date
  return job.start_planned ? tallinnDateKey(new Date(job.start_planned)) : null
}

function longDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('et-EE', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function PlanJobCard({ job }: { job: any }) {
  const name = job.object_name || job.customer_name || 'Töö'
  const workType = job.work_type_name || 'Tööliik määramata'
  const editable = !['tehtud', 'vajab_jareltegevust', 'tuhistatud'].includes(job.status)
  const canRelease = job.is_mine && editable && job.status !== 'toob'

  return <div className="job-card">
    <div className="job-card-top">
      <strong>{formatPlannedTime(job.start_planned, job.planned_time)} · {name}</strong>
      <StatusBadge status={job.status as JobStatus} />
    </div>
    <div className="job-address">{job.address || 'Aadress määramata'}</div>
    <div className="job-meta"><span>{workType}</span>{!job.is_free && !job.is_mine && <span>Hõivatud</span>}</div>

    {job.is_free && editable ? <div className="stack top-gap">
      <form action={claimJob}>
        <input type="hidden" name="id" value={job.id} />
        <button className="button primary wide" type="submit">VÕTA TÖÖ</button>
      </form>
      <Link className="button secondary wide" href={`/operator/jobs/${job.id}/edit`}>Muuda</Link>
    </div> : job.is_mine ? <div className="stack top-gap">
      <Link className="button primary wide" href={`/operator/jobs/${job.id}`}>{job.status === 'toob' ? 'JÄTKA TÖÖD' : 'AVA TÖÖ'}</Link>
      {editable && <Link className="button secondary wide" href={`/operator/jobs/${job.id}/edit`}>Muuda</Link>}
      {canRelease && <form action={releaseJob}>
        <input type="hidden" name="id" value={job.id} />
        <button className="button secondary wide" type="submit">Vabasta töö</button>
      </form>}
    </div> : editable ? <div className="top-gap"><Link className="button secondary wide" href={`/operator/jobs/${job.id}/edit`}>Muuda</Link></div> : null}
  </div>
}

export default async function OperatorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireView('worker')
  const [jobs, params] = await Promise.all([
    getSharedLiftCalendar(),
    searchParams,
  ])
  const errorText = Array.isArray(params.error) ? params.error[0] : params.error
  const today = tallinnDateKey()

  const freeDays = freeCapacityDays(jobs.map((job: any) => ({
    start_planned: job.start_planned,
    end_planned: job.end_planned,
    status: job.status as JobStatus,
  })))

  const visibleJobs = jobs.filter((job: any) => {
    const date = jobDateKey(job)
    return job.status === 'toob' || Boolean(date && date >= today)
  })

  const groups = new Map<string, any[]>()
  for (const job of visibleJobs) {
    const date = jobDateKey(job)
    if (date) groups.set(date, [...(groups.get(date) ?? []), job])
  }

  const unscheduled = jobs.filter((job: any) => !job.start_planned && !job.planned_date)

  return <div className="page stack-lg operator-page">
    <div><p className="eyebrow">Kasutaja</p><h1>Tööd</h1><p className="muted">Ühe tõstuki ühine tööplaan ja vabad ajad.</p></div>
    {params.claimed && <div className="alert success">Töö on nüüd sinu.</div>}
    {params.released && <div className="alert success">Töö vabastati ja on jälle teistele nähtav.</div>}
    {params.done && <div className="alert success">Töö lõpetatud ja salvestatud.</div>}
    {errorText && <div className="alert danger">{errorText}</div>}

    <section>
      <div className="section-title"><h2>Vabad aknad · 7 päeva</h2></div>
      <div className="capacity-row">{freeDays.length ? freeDays.map((day) => <div key={day.date} className="capacity-chip">
        <strong>{new Date(`${day.date}T12:00:00Z`).toLocaleDateString('et-EE', { weekday: 'short', day: 'numeric', month: 'numeric' })}</strong>
        <span>{day.freeHours} h vaba</span>
      </div>) : <div className="empty">Järgmise 7 päeva tööpäevad on täis.</div>}</div>
    </section>

    <section>
      <div className="section-title"><h2>Tööplaan</h2></div>
      <div className="calendar-list">{[...groups.entries()].map(([date, dayJobs]) => <section key={date}>
        <h2>{longDate(date)}</h2>
        <div className="job-list">{dayJobs.map((job: any) => <PlanJobCard key={job.id} job={job} />)}</div>
      </section>)}
      {unscheduled.length > 0 && <section>
        <h2>Aeg määramata</h2>
        <div className="job-list">{unscheduled.map((job: any) => <PlanJobCard key={job.id} job={job} />)}</div>
      </section>}
      {visibleJobs.length === 0 && unscheduled.length === 0 && <div className="empty">Töid praegu ei ole.</div>}</div>
    </section>
  </div>
}
