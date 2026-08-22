import Link from 'next/link'
import { MetricCard } from '@/components/MetricCard'
import { JobCard } from '@/components/JobCard'
import { getManagerJobs } from '@/lib/queries'
import { freeCapacityDays, managerSummary } from '@/lib/dashboard'

function eur(value: number) { return new Intl.NumberFormat('et-EE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value) }

export default async function ManagerPage() {
  const jobs = await getManagerJobs()
  const summary = managerSummary(jobs as any[])
  const freeDays = freeCapacityDays(jobs as any[])
  const now = Date.now()
  const weekJobs = jobs.filter((j: any) => Math.abs(new Date(j.start_planned).getTime() - now) <= 7 * 86400000)
  const monthJobs = jobs.filter((j: any) => Math.abs(new Date(j.start_planned).getTime() - now) <= 31 * 86400000)
  const revenue = (arr: any[]) => arr.reduce((s, j) => s + Number(j.actual_total ?? j.estimated_total ?? 0), 0)

  return <div className="page stack-lg">
    <div className="page-title-row"><div><p className="eyebrow">Juhtimispult</p><h1>Mis vajab täna tähelepanu?</h1></div><Link className="button primary" href="/manager/jobs/new">+ Lisa töö</Link></div>
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
    {summary.newJobs.length > 0 && <section><div className="section-title"><h2>Uued broneeringud</h2></div><div className="job-list">{summary.newJobs.map((job: any) => <JobCard key={job.id} job={job} href={`/manager/jobs/${job.id}`} />)}</div></section>}
    {summary.overdueNotStarted.length > 0 && <section><div className="section-title"><h2>Kontrolli kohe</h2></div><div className="job-list">{summary.overdueNotStarted.map((job: any) => <JobCard key={job.id} job={job} href={`/manager/jobs/${job.id}`} />)}</div></section>}
    <section><div className="section-title"><h2>Tänased tööd</h2><Link href="/manager/calendar">Ava kalender</Link></div><div className="job-list">{summary.todayJobs.length ? summary.todayJobs.map((job: any) => <JobCard key={job.id} job={job} href={`/manager/jobs/${job.id}`} />) : <div className="empty">Tänaseks töid ei ole.</div>}</div></section>
  </div>
}
