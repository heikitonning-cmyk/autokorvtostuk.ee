'use client'

import { startTransition, useActionState, useRef, useState, type FormEvent } from 'react'
import { savePayrollPayment, voidPayrollPayment } from '@/app/manager/time/payment-actions'
import { euros, type ActionState, type Employee } from '@/lib/payroll'
import { balanceAfterPayment, balanceTotals, parsePaymentAmount, type PayrollBalance, type PayrollPayment } from '@/lib/payroll-payments'

const initial:ActionState={}
function submit(event:FormEvent<HTMLFormElement>,action:(data:FormData)=>void) {
  event.preventDefault()
  const form=new FormData(event.currentTarget)
  startTransition(()=>action(form))
}
function Feedback({state}:{state:ActionState}) {
  return <>{state.error&&<p className="alert danger" role="alert">{state.error}</p>}{state.success&&<p className="alert success" role="status">{state.success}</p>}</>
}
function BalanceAmount({cents}:{cents:number}) {
  return <><span>{cents<0?'Ettemaks':'Saada'}</span><strong>{euros(Math.abs(cents))}</strong></>
}

export function PaymentBalances({employees,balances,onPayment}:{employees:Employee[];balances:PayrollBalance[];onPayment:(employeeId:string)=>void}) {
  const shown=employees.map(e=>({employee:e,balance:balances.find(b=>b.employee_id===e.id)})).filter(row=>row.balance&&(row.employee.active||row.balance.earned_cents!==0||row.balance.paid_cents!==0))
  const total=balanceTotals(shown.map(row=>row.balance!))
  return <section className="detail-card stack">
    <div className="payroll-selection-heading"><h2>Palga jäägid</h2><strong>Saada kokku {euros(total.due)}</strong></div>
    <p className="muted">Kogu sisestatud arvestus: teenitud tasu miinus maksed. Jääk kandub kuust kuusse. Kuu- ja objektifilter seda ei muuda.</p>
    {total.advance>0&&<p className="muted">Ettemakseid kokku {euros(total.advance)}.</p>}
    {shown.map(({employee:e,balance:b})=><article className="payroll-balance" key={e.id}>
      <div className="payroll-selection-heading"><strong>{e.name}{!e.active?' · arhiveeritud':''}</strong><button type="button" className="button secondary" onClick={()=>onPayment(e.id)}>Märgi makse</button></div>
      <div className="payroll-balance-grid"><div><span>Teenitud kokku</span><strong>{euros(b!.earned_cents)}</strong></div><div><span>Makstud kokku</span><strong>{euros(b!.paid_cents)}</strong></div><div className={b!.balance_cents<0?'payroll-advance':'payroll-due'}><BalanceAmount cents={b!.balance_cents}/></div></div>
    </article>)}
    {!shown.length&&<p className="muted">Lisa kõigepealt tööline vaates „Töölised”.</p>}
  </section>
}

function PaymentForm({employees,balances,today,requestId,employeeId,payment,onCancel}:{employees:Employee[];balances:PayrollBalance[];today:string;requestId:string;employeeId:string;payment?:PayrollPayment;onCancel:()=>void}) {
  const [state,action,pending]=useActionState(savePayrollPayment,initial)
  const [worker,setWorker]=useState(payment?.employee_id??employeeId)
  const [date,setDate]=useState(payment?.paid_date??today)
  const [amount,setAmount]=useState(payment?(payment.amount_cents/100).toFixed(2):'')
  const [note,setNote]=useState(payment?.note??'')
  // Preserve ID/version throughout this draft, including background refreshes.
  const [draftId]=useState(payment?.id??requestId)
  const [version]=useState(payment?.updated_at??'')
  const balance=balances.find(b=>b.employee_id===worker)
  let cents=0,error=''
  try {if(amount.trim()) cents=parsePaymentAmount(amount)} catch(e) {error=(e as Error).message}
  const after=balanceAfterPayment(balance,cents,payment)
  return <form action={action} onSubmit={e=>submit(e,action)} className="form-card stack">
    <h2>{payment?'Muuda makset':'Märgi väljamakse'}</h2>
    <input type="hidden" name="id" value={draftId}/><input type="hidden" name="version" value={version}/>
    <fieldset disabled={pending} className="payroll-fields stack">
      <label>Tööline<select name="employeeId" required value={worker} onChange={e=>setWorker(e.target.value)}><option value="">Vali tööline</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}{e.active?'':' (arhiveeritud)'}</option>)}</select></label>
      <div className="form-grid two"><label>Makse kuupäev<input name="date" type="date" required min="2000-01-01" max={today} value={date} onChange={e=>setDate(e.target.value)}/></label><label>Makstud summa, €<input name="amount" required inputMode="decimal" placeholder="Näiteks 500,00" value={amount} onChange={e=>setAmount(e.target.value)}/></label></div>
      <label>Märkus (soovi korral)<input name="note" maxLength={1000} placeholder="Näiteks sularaha või ülekanne" value={note} onChange={e=>setNote(e.target.value)}/></label>
      {worker&&<div className="payroll-preview" aria-live="polite"><div>{(balance?.balance_cents??0)<0?'Praegune ettemaks':'Praegu saada'}: {euros(Math.abs(balance?.balance_cents??0))}</div>{error?<small className="payroll-preview-line">{error}</small>:cents>0&&<small className="payroll-preview-line">{payment?'Pärast muudatust':'Pärast makset'} {after<0?'ettemaks':'saada'}: {euros(Math.abs(after))}</small>}</div>}
      <div className="payroll-buttons"><button className="button primary" disabled={pending||!worker||!cents||!!error}>{pending?'Salvestan…':payment?'Salvesta muudatus':'Salvesta makse'}</button>{payment&&<button type="button" className="button secondary" onClick={onCancel}>Loobu</button>}</div>
    </fieldset><Feedback state={state}/>
  </form>
}

function VoidPayment({payment}:{payment:PayrollPayment}) {
  const [state,action,pending]=useActionState(voidPayrollPayment,initial)
  return <form action={action} onSubmit={e=>{if(!window.confirm(`Tühista ${euros(payment.amount_cents)} makse kirje? See summa lisandub töölise saadaolevale jäägile tagasi.`)){e.preventDefault();return}submit(e,action)}}>
    <input type="hidden" name="id" value={payment.id}/><input type="hidden" name="version" value={payment.updated_at}/>
    <button className="button secondary" disabled={pending}>{pending?'Tühistan…':'Tühista'}</button><Feedback state={state}/>
  </form>
}

export function PayrollPayments({employees,balances,payments,today,month,requestId,initialEmployeeId,saved}:{employees:Employee[];balances:PayrollBalance[];payments:PayrollPayment[];today:string;month:string;requestId:string;initialEmployeeId:string;saved:boolean}) {
  const [edit,setEdit]=useState<PayrollPayment>()
  const [filter,setFilter]=useState(initialEmployeeId)
  const [formEmployee,setFormEmployee]=useState(initialEmployeeId)
  const heading=useRef<HTMLHeadingElement>(null)
  const visible=payments.filter(p=>!filter||p.employee_id===filter)
  const paid=visible.filter(p=>!p.voided_at).reduce((s,p)=>s+p.amount_cents,0)
  return <div className="stack">
    <h2 ref={heading} tabIndex={-1}>Palga maksed</h2>
    {saved&&<div className="alert success" role="status">Makse salvestatud ja saadaolevast summast maha arvestatud.</div>}
    <PaymentForm key={edit?.id??formEmployee??'new'} employees={employees} balances={balances} today={today} requestId={requestId} employeeId={formEmployee} payment={edit} onCancel={()=>setEdit(undefined)}/>
    <PaymentBalances employees={employees} balances={balances} onPayment={id=>{setEdit(undefined);setFilter(id);heading.current?.focus();window.scrollTo({top:0,behavior:'smooth'});setFormEmployee(id)}}/>
    <section className="detail-card stack">
      <h2>Maksete ajalugu</h2>
      <form action="/manager/time" method="get" className="payroll-month"><label>Maksete kuu<input type="month" name="month" min="2000-01" max="2099-12" required defaultValue={month}/></label><input type="hidden" name="view" value="payments"/><button className="button secondary">Näita</button></form>
      <label>Tööline<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="">Kõik töölised</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
      <strong>Valitud kuus makstud: {euros(paid)}</strong>
      {visible.map(p=><article className="payroll-payment-row stack" key={p.id}>
        <div className="payroll-entry-heading"><strong>{employees.find(e=>e.id===p.employee_id)?.name??'Tööline'}</strong><strong>{euros(p.amount_cents)}</strong></div>
        <p>{p.paid_date.split('-').reverse().join('.')}{p.note?` · ${p.note}`:''}</p>
        {p.voided_at?<p className="muted">Tühistatud · jääki ei mõjuta</p>:<div className="payroll-buttons"><button type="button" className="button secondary" onClick={()=>{setEdit(p);heading.current?.focus();window.scrollTo({top:0,behavior:'smooth'})}}>Muuda</button><VoidPayment payment={p}/></div>}
      </article>)}
      {!visible.length&&<p className="muted">Valitud kuus makseid pole.</p>}
    </section>
  </div>
}
