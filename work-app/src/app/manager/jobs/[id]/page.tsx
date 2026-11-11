import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/session'
import { getJobDetail, getJobPayrollEntry } from '@/lib/queries'
import { SimpleJobDetails } from '@/components/SimpleJobDetails'
import { DeleteJobForm } from '@/components/DeleteJobForm'
import { isActiveJob } from '@/lib/status'
import { minuteTime } from '@/lib/simple-dispatch'
import { cancelJob, deleteJob } from '../actions'

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser('manager')
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
    <Link className="button primary wide" href={`/manager/jobs/${id}/edit`}>Muuda tööd</Link>
    <section className="detail-card stack"><h2>Juhi palgaarvestus</h2>
      {entry ? <><p>{entry.work_date} · {minuteTime(entry.start_minute)}–{minuteTime(entry.end_minute)}{entry.next_day ? ' (+1 päev)' : ''} · paus {entry.break_minutes} min</p>
        <strong>{entry.paid_minutes == null ? 'Pooleli' : `${(entry.paid_minutes / 60).toLocaleString('et-EE', { maximumFractionDigits: 2 })} tundi · ${(entry.wage_cents / 100).toLocaleString('et-EE', { style: 'currency', currency: 'EUR' })}`}</strong></> : <p className="muted">Vali töö muutmisel juht ning täida töö algus ja lõpp. Salvestamisel kantakse tema tunnid palgaarvestusse.</p>}
      <Link href="/manager/time">Ava palgaarvestus</Link>
    </section>
    <details className="detail-card"><summary>Muud toimingud</summary><div className="stack top-gap">
      {isActiveJob(job) && <form action={cancelJob}><input type="hidden" name="id" value={id} /><button className="button secondary wide">Tühista töö</button></form>}
      <DeleteJobForm action={deleteJob} jobId={id} jobName={job.object_name || job.address || 'Töö'} />
    </div></details>
  </div>
}
