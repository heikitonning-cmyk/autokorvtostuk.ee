import Link from 'next/link'
import { MetricCard } from '@/components/MetricCard'
import { JobCard } from '@/components/JobCard'
import { getManagerJobs } from '@/lib/queries'
import { freeCapacityDays, jobsWithinDays, managerJobSections, managerSummary, managerDashboardFilter, jobsOnPlannedDate } from '@/lib/dashboard'
import { validDate } from '@/lib/payroll'
import { isActiveJob, isCompletedJob } from '@/lib/status'

function eur(value: number) { return new Intl.NumberFormat('et-EE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value) }

function longDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('et-EE', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

export default async function ManagerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const jobs = await getManagerJobs()
  const query = await searchParams
  const now = new Date()
  const summary = managerSummary(jobs as any[], now)
  const freeDays = freeCapacityDays(jobs as any[], now)
  const view = query.view === 'all' ? 'all' : query.view === 'history' ? 'history' : 'active'
  const selected = managerDashboardFilter(jobs as any[], String(query.filter ?? ''), now)
  const selectedDate = typeof query.date === 'string' && validDate(query.date) ? query.date : null
  const filtered = selected ?? (selectedDate ? {title:longDate(selectedDate),jobs:jobsOnPlannedDate(jobs as any[],selectedDate)} : null)
  const visibleJobs = filtered?.jobs ?? (view === 'all' ? jobs : jobs.filter((job: any) => view === 'history' ? isCompletedJob(job) : isActiveJob(job)))
  const jobSections = managerJobSections(visibleJobs as any[], now)
  const weekJobs = jobsWithinDays(jobs as any[], 7, now)
  const monthJobs = jobsWithinDays(jobs as any[], 30, now)
  const revenue = (arr: any[]) => arr.reduce((s, j) => s + Number(j.actual_total ?? j.estimated_total ?? 0), 0)

  return <div className="page stack-lg">
    <div className="page-title-row"><div><p className="eyebrow">Juhtimispult</p><h1>Mis vajab täna tähelepanu?</h1></div><Link className="button primary" href="/manager/jobs/new">+ Lisa töö</Link></div>
    {query.deleted && <div className="alert success">Töö kustutatud.</div>}
    <section className="metrics-grid">
      <MetricCard href="/manager?filter=today#jobs" label="Täna" value={eur(summary.todayRevenue)} note={`${summary.todayJobs.length} tööd`} />
      <MetricCard href="/manager?filter=week#jobs" label="7 päeva" value={eur(revenue(weekJobs))} note={`${weekJobs.length} tööd`} />
      <MetricCard href="/manager?filter=month#jobs" label="30 päeva" value={eur(revenue(monthJobs))} note={`${monthJobs.length} tööd`} />
    </section>
    <section className="attention-grid">
      <Link href="/manager?filter=new#jobs" className="attention-card"><span>Uued</span><strong>{summary.newJobs.length}</strong><small>ootavad kinnitamist</small></Link>
      <Link href="/manager?filter=overdue#jobs" className="attention-card danger-soft"><span>Hilinenud</span><strong>{summary.overdueNotStarted.length}</strong><small>tähtaeg möödas ja lõpetamata</small></Link>
      <Link href="/manager?filter=follow-up#jobs" className="attention-card warn-soft"><span>Järeltegevus</span><strong>{summary.followUp.length}</strong><small>vajavad sinu sekkumist</small></Link>
    </section>
    <section><div className="section-title"><h2>Vabad aknad · 7 päeva</h2></div><div className="capacity-row">{freeDays.length ? freeDays.map((d) => <Link href={`/manager?date=${d.date}#jobs`} key={d.date} className="capacity-chip dashboard-link"><strong>{new Date(`${d.date}T12:00:00Z`).toLocaleDateString('et-EE',{weekday:'short',day:'numeric',month:'numeric'})}</strong><span>{d.freeHours} h vaba</span></Link>) : <div className="empty">Järgmise 7 päeva tööpäevad on täis.</div>}</div></section>
    <section id="jobs" className="dashboard-jobs">
      <div className="section-title"><h2>{filtered ? filtered.title : view === 'history' ? 'Tööde ajalugu' : view === 'all' ? 'Kõik tööd' : 'Aktiivsed tööd'} <span className="count">{visibleJobs.length}</span></h2><Link href="/manager/calendar">Ava kalender</Link></div>
      {filtered && <div className="filter-banner"><Link className="button secondary" href="/manager#jobs">Näita kõiki aktiivseid töid</Link>{selectedDate && <Link className="button primary" href={`/manager/jobs/new?date=${selectedDate}`}>+ Lisa töö sellele päevale</Link>}</div>}
      <div className="segmented"><Link className={!filtered && view === 'active' ? 'active' : ''} href="/manager">Aktiivsed</Link><Link className={!filtered && view === 'history' ? 'active' : ''} href="?view=history">Ajalugu</Link><Link className={!filtered && view === 'all' ? 'active' : ''} href="?view=all">Kõik</Link></div>
      <div className="calendar-list">{jobSections.length ? jobSections.map((section) => <section key={section.key}>
        <h2>{section.cancelled ? `Tühistatud · ${section.date ? longDate(section.date) : 'Aeg määramata'}` : section.date ? longDate(section.date) : 'Aeg määramata'}</h2>
        <div className="job-list">{section.jobs.map((job: any) => <JobCard key={job.id} job={job} href={`/manager/jobs/${job.id}`} />)}</div>
      </section>) : <div className="empty">Töid ei ole.</div>}</div>
    </section>
  </div>
}
