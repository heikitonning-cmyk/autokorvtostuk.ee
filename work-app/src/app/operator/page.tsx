import Link from 'next/link'
import { requireView } from '@/lib/session'
import { getSharedLiftCalendar } from '@/lib/queries'
import { JobContactActions } from '@/components/JobContactActions'
import { jobPhoneHref } from '@/lib/job-contact'
import { wazeUrl } from '@/lib/job-stops'
import { operatorJobDate, operatorJobTime, operatorPlanJobs } from '@/lib/operator-plan'
import { tallinnDate } from '@/lib/payroll'
import { StatusBadge } from '@/components/StatusBadge'
import { orderWorkPlanDates } from '@/lib/dashboard'
import type { JobStatus } from '@/lib/domain'

function longDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('et-EE', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function PlanJobCard({ job }: { job: any }) {
  return <div className="job-card">
    <div className="job-card-top"><strong>{operatorJobTime(job)}</strong><StatusBadge status={job.status as JobStatus} /></div>
    <div className="job-address"><strong>{job.address || 'Aadress määramata'}</strong></div>
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

  const today = tallinnDate()
  const filteredJobs = operatorPlanJobs(jobs, view, today)
  const visibleJobs = filteredJobs.filter(job => operatorJobDate(job))

  const groups = new Map<string, any[]>()
  for (const job of visibleJobs) {
    const date = operatorJobDate(job)
    if (date) groups.set(date, [...(groups.get(date) ?? []), job])
  }

  const unscheduled = filteredJobs.filter(job => !operatorJobDate(job))

  return <div className="page stack-lg operator-page">
    <div><p className="eyebrow">Juht</p><h1>Tööd</h1><p className="muted">Tänased ja tulevased tööd, kellaajad ning aadressid.</p></div>
    {params.done && <div className="alert success">Töö lõpetatud ja salvestatud.</div>}
    {errorText && <div className="alert danger">{errorText}</div>}

    <section>
      <div className="section-title"><h2>{view === 'history' ? 'Varasemad tööd' : view === 'calendar' ? 'Kalender' : 'Tööplaan'}</h2></div>
      <div className="segmented"><Link className={view === 'active' ? 'active' : ''} href="/operator">Tänased ja tulevased</Link><Link className={view === 'history' ? 'active' : ''} href="?view=history">Varasemad tööd</Link><Link className={view === 'calendar' ? 'active' : ''} href="?view=calendar">Kalender</Link></div>
      <div className="calendar-list">{orderWorkPlanDates(groups.keys(), view, today).map(date => <section key={date}>
        <h2>{date === today ? 'Täna · ' : ''}{longDate(date)}</h2>
        <div className="job-list">{groups.get(date)?.map((job: any) => <PlanJobCard key={job.id} job={job} />)}</div>
      </section>)}
      {unscheduled.length > 0 && <section>
        <h2>Aeg määramata</h2>
        <div className="job-list">{unscheduled.map((job: any) => <PlanJobCard key={job.id} job={job} />)}</div>
      </section>}
      {visibleJobs.length === 0 && unscheduled.length === 0 && <div className="empty">{view === 'active' ? 'Tänaseks ja edaspidiseks töid praegu ei ole.' : 'Selles vaates töid praegu ei ole.'}</div>}</div>
    </section>
  </div>
}
