import Link from 'next/link'
import { payrollHistoryParams, payrollHistoryRange } from '@/lib/payroll-history'
import type { PayrollBalance, PayrollPayment } from '@/lib/payroll-payments'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { readAllPages } from '@/lib/pagination'
import { monthRange, tallinnDate, type Employee, type PayrollSite, type TimeEntry } from '@/lib/payroll'
import { PayrollWorkspace } from '@/components/PayrollWorkspace'

export default async function TimePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser('manager')
  const params = await searchParams
  const today = tallinnDate()
  const history=payrollHistoryParams(params,today.slice(0,7))
  const {month}=history
  const historyRange=payrollHistoryRange(history)
  const { from, to } = monthRange(month)
  const db = await createClient()
  let data
  try {
    data = await Promise.all([
      readAllPages<Employee>((a,b) => db.from('payroll_employees').select('id,name,hourly_rate_cents,active,updated_at').order('name').order('id').range(a,b)),
      readAllPages<PayrollSite>((a,b) => db.from('customer_sites').select('id,name,customer_id,active').order('name').order('id').range(a,b)),
      readAllPages<{id:string;name:string}>((a,b) => db.from('customers').select('id,name').order('name').order('id').range(a,b)),
      history.allDays && !history.employeeId ? Promise.resolve([] as TimeEntry[]) : readAllPages<TimeEntry>((a,b) => {
        let query=db.from('payroll_entries').select('*, sites:payroll_entry_sites(site_id)').not('end_minute','is',null)
        if(historyRange) query=query.gte('work_date',historyRange.from).lt('work_date',historyRange.to)
        if(history.employeeId) query=query.eq('employee_id',history.employeeId)
        return query.order('work_date',{ascending:false}).order('start_minute',{ascending:false}).order('id').range(a,b)
      }),
      readAllPages<TimeEntry>((a,b) => db.from('payroll_entries').select('*, sites:payroll_entry_sites(site_id)').is('end_minute',null).order('work_date').order('start_minute').order('id').range(a,b)),
      readAllPages<PayrollPayment>((a,b)=>db.from('payroll_payments').select('id,employee_id,paid_date,amount_cents,note,updated_at,voided_at').gte('paid_date',from).lt('paid_date',to).order('paid_date',{ascending:false}).order('id').range(a,b)),
      readAllPages<PayrollBalance>((a,b)=>db.rpc('payroll_balances').order('employee_id').range(a,b)),
    ])
  } catch {
    return <div className="page stack-lg"><h1>Tunnid ja palgad</h1><div className="alert danger" role="alert">Andmeid ei õnnestunud laadida. Proovi leht uuesti avada. Kui viga kordub, vajab mooduli ühendus kontrollimist.</div><Link className="button secondary" href="/manager/time">Proovi uuesti</Link></div>
  }
  const saved = typeof params.saved === 'string'
  return <PayrollWorkspace key={`${month}-${history.employeeId}-${history.allDays}-${params.saved ?? ''}-${params.view ?? ''}-${params.paymentSaved ?? ''}`} history={history} month={month} today={today} employees={data[0]} sites={data[1]} customers={data[2]} entries={data[3]} running={data[4]} now={new Date().toISOString()} payments={data[5]} balances={data[6]} paymentRequestId={crypto.randomUUID()} showPayments={params.view==='payments'} paymentSaved={typeof params.paymentSaved==='string'} saved={saved} showSummary={saved || params.view === 'summary'} />
}
