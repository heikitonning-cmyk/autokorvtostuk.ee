import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/session'
import { getJobDetail, getJobPayrollEntry } from '@/lib/queries'
import { SimpleJobDetails } from '@/components/SimpleJobDetails'
import { MarkJobCompleted } from '@/components/MarkJobCompleted'
import { DeleteJobForm } from '@/components/DeleteJobForm'
import { canMarkJobCompleted, isActiveJob } from '@/lib/status'
import { minuteTime } from '@/lib/simple-dispatch'
import { cancelJob, confirmJob, deleteJob } from '../actions'

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser('manager')
  const { id } = await params
  const query = await searchParams
  let job: any
  try { job = await getJobDetail(id) } catch { notFound() }
  const entry = await getJobPayrollEntry(id)
  return <div className="page narrow stack-lg">
    <Link className="back-link" href="/manager">← Tööde juurde</Link>
    {query.saved && <div className="alert success">Töö salvestatud.</div>}
    {query.error && <div role="alert" className="alert danger">Toiming ebaõnnestus. Proovi uuesti.</div>}
    <SimpleJobDetails job={job} />
    {job.status === 'uus' && <form action={confirmJob}><input type="hidden" name="id" value={id} /><button className="button primary wide">Kinnita töö</button></form>}
    <Link className="button primary wide" href={`/manager/jobs/${id}/edit`}>Muuda tööd / juhi tööaega</Link>
    <section className="detail-card stack"><h2>Juhi tööaeg</h2>
      {entry ? <><p>{entry.work_date} · {minuteTime(entry.start_minute)}–{minuteTime(entry.end_minute)}{entry.next_day ? ' (+1 päev)' : ''} · paus {entry.break_minutes} min</p>
        <strong>{entry.paid_minutes == null ? 'Pooleli' : `${(entry.paid_minutes / 60).toLocaleString('et-EE', { maximumFractionDigits: 2 })} tundi · ${(entry.wage_cents / 100).toLocaleString('et-EE', { style: 'currency', currency: 'EUR' })}`}</strong></> : <p className="muted">Selle töö juurde pole juhi tööaega lisatud. Töö kokkulepitud kellaaeg palka ei arvuta.</p>}
      <Link href="/manager/time">Ava palgaarvestus</Link>
    </section>
    {canMarkJobCompleted(user, job) && <MarkJobCompleted jobId={id} view="manager" />}
    <details className="detail-card"><summary>Muud toimingud</summary><div className="stack top-gap">
      {isActiveJob(job) && <form action={cancelJob}><input type="hidden" name="id" value={id} /><button className="button secondary wide">Tühista töö</button></form>}
      <DeleteJobForm action={deleteJob} jobId={id} jobName={job.object_name || job.address || 'Töö'} />
    </div></details>
  </div>
}
