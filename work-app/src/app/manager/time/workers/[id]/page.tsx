import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { readAllPages } from '@/lib/pagination'
import { clock, entryLocation, euros, hours, tallinnDate, type PayrollSite } from '@/lib/payroll'
import { dateLabel, type DayEntry, type DayJob } from '@/lib/work-days'
import type { PayrollBalance, PayrollPayment } from '@/lib/payroll-payments'
import { HoursTabs } from '@/components/HoursTabs'
import { EmployeeForm } from '@/components/PayrollWorkspace'
import { payrollPeriod, periodEntries, periodPayments } from '@/lib/payroll-period'
import { WorkerPayments } from '@/components/WorkerPayments'

export default async function WorkerPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  await requireUser('manager')
  const {id}=await params,query=await searchParams,db=await createClient()
  if(!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const employee=await db.from('payroll_employees').select('*').eq('id',id).maybeSingle()
  if(employee.error) throw employee.error
  if(!employee.data) notFound()
  const [entries,payments,balances,jobs,sites]=await Promise.all([
    readAllPages<DayEntry>((a,b)=>db.from('payroll_entries').select('*,sites:payroll_entry_sites(site_id),job:jobs!payroll_entries_job_id_fkey(address)').eq('employee_id',id).order('work_date',{ascending:false}).order('start_minute').order('id').range(a,b)),
    readAllPages<PayrollPayment>((a,b)=>db.from('payroll_payments').select('*').eq('employee_id',id).order('paid_date',{ascending:false}).order('id').range(a,b)),
    readAllPages<PayrollBalance>((a,b)=>db.rpc('payroll_balances').eq('employee_id',id).order('employee_id').range(a,b)),
    readAllPages<DayJob>((a,b)=>db.from('jobs').select('id,address,planned_date,planned_time,planned_end_time,work_day_id,contact_phone,description,driver_employee_id,site_id,updated_at').not('work_day_id','is',null).order('planned_time').order('id').range(a,b)),
    readAllPages<PayrollSite>((a,b)=>db.from('customer_sites').select('id,name,customer_id,active').order('id').range(a,b)),
  ])
  const rateHistory=await db.from('payroll_rate_history').select('effective_from,hourly_rate_cents').eq('employee_id',id).order('effective_from',{ascending:false})
  if(rateHistory.error) throw rateHistory.error
  const balance=balances[0]??{employee_id:id,earned_cents:0,paid_cents:0,balance_cents:0}
  const period=payrollPeriod(query.from,query.to), selected=periodEntries(entries,period)
  const paidInPeriod=periodPayments(payments,period), periodBalance=selected.cents-paidInPeriod
  return <div className="page day-page stack-lg"><Link href="/manager/time" className="back-link">← Kõik töölised</Link><div><p className="eyebrow">Tööline</p><h1>{employee.data.name}</h1></div><HoursTabs view="workers"/>
    {(query.saved||query.paymentSaved)&&<p className="alert success">Muudatus salvestatud. Palga jääk on uuendatud.</p>}
    <section className="detail-card payroll-balance-grid"><div><span>Teenitud kokku</span><strong>{euros(balance.earned_cents)}</strong></div><div><span>Makstud kokku</span><strong>{euros(balance.paid_cents)}</strong></div><div className="payroll-due"><span>{balance.balance_cents<0?'Ettemaks':'Saada'}</span><strong>{euros(Math.abs(balance.balance_cents))}</strong></div></section>
    <WorkerPayments key={String(query.paymentSaved??'')} employee={employee.data} balance={balance} payments={payments} today={tallinnDate()} requestId={crypto.randomUUID()}/>
    <section className="detail-card stack" aria-label="Tundide ajavahemik">
      <h2>Tundide ajavahemik</h2>
      <form method="get" action={`/manager/time/workers/${id}`} className="stack" key={`${period.from}:${period.to}`}>
        <div className="form-grid two">
          <label>Alguskuupäev<input type="date" name="from" min="2000-01-01" max="2099-12-31" defaultValue={period.from}/></label>
          <label>Lõppkuupäev<input type="date" name="to" min="2000-01-01" max="2099-12-31" defaultValue={period.to}/></label>
        </div>
        <div className="form-grid two"><button className="button primary">Näita perioodi</button><Link className="button secondary" href={`/manager/time/workers/${id}`}>Kõik ajad</Link></div>
      </form>
      {period.error?<p className="alert danger" role="alert">{period.error}</p>:<>
        <p className="muted">{period.from||period.to?`${period.from?dateLabel(period.from):'Algusest'} – ${period.to?dateLabel(period.to):'tänaseni ja edasi'}`:'Kõik sisestatud tööpäevad'}. Arvestus tööpäeva kuupäeva järgi.</p>
        <div className="payroll-balance-grid"><div><span>Tööpäevi</span><strong>{selected.days}</strong></div><div><span>Tunde perioodil</span><strong>{hours(selected.minutes)}</strong></div><div><span>Teenitud perioodil</span><strong>{euros(selected.cents)}</strong></div></div>
        <div className="payroll-balance-grid"><div><span>Makstud perioodil</span><strong>{euros(paidInPeriod)}</strong></div><div className={periodBalance<0?'payroll-advance':'payroll-due'}><span>Perioodi jääk</span><strong>{euros(periodBalance)}</strong></div></div>
        <small className="muted">Perioodi jääk = perioodil teenitud tasu − samal perioodil makstud summa (makse kuupäeva järgi). Varasem jääk ei sisaldu. Miinus tähendab, et perioodil maksti rohkem kui teeniti.</small>
        {!!selected.running&&<p className="muted">Lõpetamata ajakirjeid: {selected.running}. Nende tunnid ja tasu lisanduvad pärast lõpetamist.</p>}
      </>}
      <small className="muted">Ajavahemik ei muuda kogu palgajääki ega maksete ajalugu.</small>
    </section>
    <section className="stack"><h2>Tööpäevad ja objektid</h2>{selected.entries.map(e=>{const objects=e.work_day_id?jobs.filter(j=>j.work_day_id===e.work_day_id):[],href=e.work_day_id?`/manager/time/days/${e.work_date}`:`/manager/time/entries/${e.id}`;return <article key={e.id} className="detail-card stack"><Link href={href} className="day-team-heading"><strong>{dateLabel(e.work_date)} · {clock(e.start_minute)}–{e.end_minute===null?'käimas':clock(e.end_minute)}{e.next_day?' (+1 päev)':''}</strong><strong>{e.wage_cents===null?'Lõpeta tööaeg →':euros(e.wage_cents)}</strong></Link><small className="muted">{e.paid_minutes!==null?`${hours(e.paid_minutes)} × ${euros(e.hourly_rate_cents)}/h · `:''}paus {e.break_minutes} min</small>{objects.length?objects.map(j=><Link className="day-object-link" href={`${href}#job-${j.id}`} key={j.id}><span>{j.address||'Aadress määramata'}</span><small>{j.planned_time?.slice(0,5)}–{j.planned_end_time?.slice(0,5)} →</small></Link>):<Link className="day-object-link" href={href}>{entryLocation(e,id=>sites.find(s=>s.id===id)?.name??'Objekt')} →</Link>}{e.note&&<small className="muted">{e.note}</small>}</article>})}{!period.error&&!selected.entries.length&&<p className="empty">Valitud ajavahemikus pole töötunde.</p>}</section>
    <details className="detail-card"><summary>Töölise andmed ja tunnihind</summary><div className="stack top-gap"><EmployeeForm employee={employee.data}/>{!!rateHistory.data?.length&&<div className="stack"><h3>Tunnihinna ajalugu</h3>{rateHistory.data.map(r=><div className="day-team-heading" key={r.effective_from}><span>Alates {dateLabel(r.effective_from)}</span><strong>{euros(r.hourly_rate_cents)}/h</strong></div>)}</div>}</div></details>
  </div>
}
