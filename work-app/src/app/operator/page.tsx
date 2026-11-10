import Link from 'next/link'
import { requireView } from '@/lib/session'
import { getSharedLiftCalendar } from '@/lib/queries'
import { JobContactActions } from '@/components/JobContactActions'
import { jobPhoneHref } from '@/lib/job-contact'
import { wazeUrl } from '@/lib/job-stops'
import { formatPlannedTime } from '@/lib/jobs'
import { StatusBadge } from '@/components/StatusBadge'
import { isActiveJob, isCompletedJob } from '@/lib/status'
import type { JobStatus } from '@/lib/domain'

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
  return <div className="job-card">
    <div className="job-card-top"><strong>{formatPlannedTime(job.start_planned, job.planned_time)} · {name}</strong><StatusBadge status={job.status as JobStatus} /></div>
    <div className="job-address">{job.address || 'Aadress määramata'}</div>
    <p>Juht: <strong>{job.driver_name || (!job.dispatch_managed && job.operator?.name) || 'määramata'}</strong></p>
    {job.description && <p className="simple-job-description">{job.description}</p>}
    <div className="stack top-gap"><JobContactActions navigationUrl={job.address ? wazeUrl(job.address) : null} phoneUrl={jobPhoneHref(job)} />
      <Link href={`/operator/jobs/${job.id}`}>Töö andmed</Link>
    </div>
  </div>
}

export default async function OperatorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireView('worker')
  const [jobs, params] = await Promise.all([
    getSharedLiftCalendar(true),
    searchParams,
  ])
  const errorText = Array.isArray(params.error) ? params.error[0] : params.error
  const view = params.view === 'history' ? 'history' : params.view === 'calendar' ? 'calendar' : 'active'

  const visibleJobs = jobs.filter((job: any) => {
    const date = jobDateKey(job)
    return Boolean(date) && (view === 'calendar' || (view === 'history' ? isCompletedJob(job) : isActiveJob(job)))
  })

  const groups = new Map<string, any[]>()
  for (const job of visibleJobs) {
    const date = jobDateKey(job)
    if (date) groups.set(date, [...(groups.get(date) ?? []), job])
  }

  const unscheduled = jobs.filter((job: any) => !job.start_planned && !job.planned_date &&
    (view === 'calendar' || (view === 'history' ? isCompletedJob(job) : isActiveJob(job))))

  return <div className="page stack-lg operator-page">
    <div><p className="eyebrow">Juht</p><h1>Tööd</h1><p className="muted">Tööplaan, navigeerimine ja tellija kontakt.</p></div>
    {params.done && <div className="alert success">Töö lõpetatud ja salvestatud.</div>}
    {errorText && <div className="alert danger">{errorText}</div>}

    <section>
      <div className="section-title"><h2>{view === 'history' ? 'Tööde ajalugu' : view === 'calendar' ? 'Kalender' : 'Tööplaan'}</h2></div>
      <div className="segmented"><Link className={view === 'active' ? 'active' : ''} href="/operator">Aktiivsed</Link><Link className={view === 'history' ? 'active' : ''} href="?view=history">Ajalugu</Link><Link className={view === 'calendar' ? 'active' : ''} href="?view=calendar">Kalender</Link></div>
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
