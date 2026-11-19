import Link from 'next/link'
import { CustomerPriceSummary } from '@/components/CustomerPriceSummary'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/session'
import { getJobDetail, getJobPayrollEntry } from '@/lib/queries'
import { getWorkDay } from '@/lib/work-day-queries'
import { getDispatchReferences } from '@/lib/queries'
import { clock, euros, hours } from '@/lib/payroll'
import { SimpleJobDetails } from '@/components/SimpleJobDetails'
import { DeleteJobForm } from '@/components/DeleteJobForm'
import { InvoiceBadge } from '@/components/InvoiceBadge'
import { StartInvoiceForm } from '@/components/StartInvoiceForm'
import { getInvoice } from '@/lib/invoice-queries'
import { tallinnDate } from '@/lib/payroll'
import { isActiveJob, isCompletedJob } from '@/lib/status'
import { minuteTime } from '@/lib/simple-dispatch'
import { cancelJob, deleteJob } from '../actions'

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser('manager')
  const { id } = await params
  const query = await searchParams
  let job: any
  try { job = await getJobDetail(id) } catch { notFound() }
  const invoice=await getInvoice(id)
  const entry = job.work_day_id ? null : await getJobPayrollEntry(id)
  const dayData=job.work_day_id?await getWorkDay(job.planned_date):null
  const refs=dayData?await getDispatchReferences():null
  return <div className="page narrow stack-lg">
    <Link className="back-link" href="/manager">← Tööde juurde</Link>
    {query.saved && <div className="alert success">Töö salvestatud.</div>}
    {query.error && <div role="alert" className="alert danger">Toiming ebaõnnestus. Proovi uuesti.</div>}
    <SimpleJobDetails job={job} />
    <CustomerPriceSummary job={job}/>
    <section className="detail-card stack"><h2>Arve</h2>
      {invoice?<><InvoiceBadge invoice={invoice} today={tallinnDate()}/><Link className="button secondary wide" href={`/manager/invoices/${id}`}>Ava arve · esitatud / makstud</Link></>:(isActiveJob(job)||isCompletedJob(job))?<><p className="muted">{isCompletedJob(job)?'Selle varasema töö arvete jälgimine pole aktiveeritud.':'Lõpetatud töö ilmub automaatselt jaotusesse „Arve tegemata”.'}</p><StartInvoiceForm jobId={id} completed={isCompletedJob(job)}/></>:<p className="muted">Tühistatud tööle arvet automaatselt ei lisata.</p>}
    </section>
    <Link className="button primary wide" href={`/manager/jobs/${id}/edit`}>Muuda tööd</Link>
    <section className="detail-card stack"><h2>{dayData?'Päeva meeskond ja palgaarvestus':'Juhi palgaarvestus'}</h2>
      {dayData ? <><p>{dayData.day?`${clock(dayData.day.start_minute)}–${clock(dayData.day.end_minute)}`:''} · {dayData.jobs.length} objekti</p>{dayData.entries.map(e=><div className="day-pay-row" key={e.id}><Link href={`/manager/time/workers/${e.employee_id}`}>{refs?.employees.find(w=>w.id===e.employee_id)?.name??'Tööline'}</Link><span>{hours(e.paid_minutes??0)}</span><strong>{euros(e.wage_cents??0)}</strong></div>)}<Link href={`/manager/time/days/${job.planned_date}`}>Muuda päeva aega ja meeskonda →</Link></> : entry ? <><p>{entry.work_date} · {minuteTime(entry.start_minute)}–{minuteTime(entry.end_minute)}{entry.next_day ? ' (+1 päev)' : ''} · paus {entry.break_minutes} min</p>
        <strong>{entry.paid_minutes == null ? 'Pooleli' : `${(entry.paid_minutes / 60).toLocaleString('et-EE', { maximumFractionDigits: 2 })} tundi · ${(entry.wage_cents / 100).toLocaleString('et-EE', { style: 'currency', currency: 'EUR' })}`}</strong></> : <p className="muted">Vali töö muutmisel juht ning täida töö algus ja lõpp. Salvestamisel kantakse tema tunnid palgaarvestusse.</p>}
      <Link href="/manager/time">Ava palgaarvestus</Link>
    </section>
    <details className="detail-card"><summary>Muud toimingud</summary><div className="stack top-gap">
      {isActiveJob(job) && <form action={cancelJob}><input type="hidden" name="id" value={id} /><button className="button secondary wide">Tühista töö</button></form>}
      <DeleteJobForm action={deleteJob} jobId={id} jobName={job.object_name || job.address || 'Töö'} />
    </div></details>
  </div>
}
