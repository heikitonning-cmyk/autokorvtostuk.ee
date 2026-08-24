import Link from 'next/link'
import { MetricCard } from '@/components/MetricCard'
import { JobCard } from '@/components/JobCard'
import { getManagerJobs } from '@/lib/queries'
import { freeCapacityDays, jobsWithinDays, managerJobSections, managerSummary } from '@/lib/dashboard'

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
  const jobSections = managerJobSections(jobs as any[], now)
  const weekJobs = jobsWithinDays(jobs as any[], 7, now)
  const monthJobs = jobsWithinDays(jobs as any[], 31, now)
  const revenue = (arr: any[]) => arr.reduce((s, j) => s + Number(j.actual_total ?? j.estimated_total ?? 0), 0)

  return <div className="page stack-lg">
    <div className="page-title-row"><div><p className="eyebrow">Juhtimispult</p><h1>Mis vajab täna tähelepanu?</h1></div><Link className="button primary" href="/manager/jobs/new">+ Lisa töö</Link></div>
    {query.deleted && <div className="alert success">Töö kustutatud.</div>}
    <section className="metrics-grid">
      <MetricCard label="Täna" value={eur(summary.todayRevenue)} note={`${summary.todayJobs.length} tööd`} />
      <MetricCard label="7 päeva" value={eur(revenue(weekJobs))} note={`${weekJobs.length} tööd`} />
      <MetricCard label="30 päeva" value={eur(revenue(monthJobs))} note={`${monthJobs.length} tööd`} />
    </section>
    <section className="attention-grid">
      <div className="attention-card"><span>Uued</span><strong>{summary.newJobs.length}</strong><small>ootavad kinnitamist</small></div>
      <div className="attention-card danger-soft"><span>Hilinenud</span><strong>{summary.overdueNotStarted.length}</strong><small>pidanuks juba algama</small></div>
      <div className="attention-card warn-soft"><span>Järeltegevus</span><strong>{summary.followUp.length}</strong><small>vajavad sinu sekkumist</small></div>
    </section>
    <section><div className="section-title"><h2>Vabad aknad · 7 päeva</h2></div><div className="capacity-row">{freeDays.length ? freeDays.map((d) => <div key={d.date} className="capacity-chip"><strong>{new Date(`${d.date}T12:00:00Z`).toLocaleDateString('et-EE',{weekday:'short',day:'numeric',month:'numeric'})}</strong><span>{d.freeHours} h vaba</span></div>) : <div className="empty">Järgmise 7 päeva tööpäevad on täis.</div>}</div></section>
    <section>
      <div className="section-title"><h2>Kõik tööd <span className="count">{jobs.length}</span></h2><Link href="/manager/calendar">Ava kalender</Link></div>
      <div className="calendar-list">{jobSections.length ? jobSections.map((section) => <section key={section.key}>
        <h2>{section.cancelled ? `Tühistatud · ${section.date ? longDate(section.date) : 'Aeg määramata'}` : section.date ? longDate(section.date) : 'Aeg määramata'}</h2>
        <div className="job-list">{section.jobs.map((job: any) => <JobCard key={job.id} job={job} href={`/manager/jobs/${job.id}`} />)}</div>
      </section>) : <div className="empty">Töid ei ole.</div>}</div>
    </section>
  </div>
}
