'use client'
import { useState } from 'react'
import { PaymentForm, VoidPayment } from '@/components/PayrollPayments'
import { euros, type Employee } from '@/lib/payroll'
import { dateLabel } from '@/lib/work-days'
import type { PayrollBalance, PayrollPayment } from '@/lib/payroll-payments'
export function WorkerPayments({employee,balance,payments,today,requestId}:{employee:Employee;balance:PayrollBalance;payments:PayrollPayment[];today:string;requestId:string}) {
  const [edit,setEdit]=useState<PayrollPayment>()
  return <section className="stack" id="payments"><details className="detail-card" open={edit?true:undefined}><summary>Märgi makse</summary><div className="top-gap"><PaymentForm key={edit?.id??requestId} employees={[employee]} balances={[balance]} today={today} requestId={requestId} employeeId={employee.id} payment={edit} onCancel={()=>setEdit(undefined)}/></div></details>
    <div className="detail-card stack"><h2>Maksete ajalugu</h2>{payments.map(p=><article key={p.id} className="payroll-payment-row stack"><div className="day-team-heading"><span>{dateLabel(p.paid_date)}</span><strong>{euros(p.amount_cents)}</strong></div>{p.note&&<p>{p.note}</p>}{p.voided_at?<small className="muted">Tühistatud · jääki ei mõjuta</small>:<div className="payroll-buttons"><button type="button" className="button secondary" onClick={()=>{setEdit(p);document.getElementById('payments')?.scrollIntoView({behavior:'smooth'})}}>Muuda</button><VoidPayment payment={p}/></div>}</article>)}{!payments.length&&<p className="muted">Makseid pole veel märgitud.</p>}</div>
  </section>
}
