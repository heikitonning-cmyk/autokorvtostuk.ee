'use client'
import { startTransition,useActionState,useEffect,useRef,useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveInvoice,type InvoiceActionState } from '@/app/manager/invoices/actions'
import { addCalendarDays,dayDifference,type InvoiceState,type TrackedInvoice } from '@/lib/invoices'
export function InvoiceForm({invoice,today,defaultPayer=''}:{invoice:TrackedInvoice;today:string;defaultPayer?:string}) {
  const [state,action,pending]=useActionState(saveInvoice,{} as InvoiceActionState)
  const router=useRouter(),ref=useRef<HTMLFormElement>(null)
  const [issued,setIssued]=useState(invoice.issued_on??today)
  const [due,setDue]=useState(invoice.due_on??addCalendarDays(today,7))
  const [days,setDays]=useState(String(dayDifference(issued,due)))
  const [amount,setAmount]=useState(invoice.amount_cents===null?'':(Number(invoice.amount_cents)/100).toFixed(2))
  const [override,setOverride]=useState(invoice.amount_override)
  const [localError,setLocalError]=useState('')
  useEffect(()=>{if(state.invoice) router.refresh()},[state.invoice,router])
  const submit=(status:InvoiceState)=>{
    setLocalError('')
    if(!ref.current?.reportValidity())return
    const data=new FormData(ref.current);data.set('status',status)
    startTransition(()=>action(data))
  }
  const changeIssued=(value:string)=>{
    setIssued(value)
    try {setDue(addCalendarDays(value,Number(days)))} catch { /* Invalid intermediate date is validated on save. */ }
  }
  return <form ref={ref} action={action} className="invoice-form stack">
    <input type="hidden" name="jobId" value={invoice.job_id}/>
    <input type="hidden" name="version" value={invoice.version}/>
    <input type="hidden" name="status" value={invoice.status}/>
    <input type="hidden" name="amountOverride" value={String(override)}/>
    <fieldset disabled={pending} className="payroll-fields stack">
      <div className="invoice-checks">
        <label className="check-row"><input type="checkbox" checked={invoice.status!=='draft'} disabled={invoice.status==='paid'}
          onChange={e=>submit(e.target.checked?'unpaid':'draft')}/>Arve esitatud</label>
        {invoice.status!=='draft'&&<label className="check-row"><input type="checkbox" checked={invoice.status==='paid'}
          onChange={e=>submit(e.target.checked?'paid':'unpaid')}/>Arve makstud</label>}
      </div>
      <p className="muted">Linnukese muutmine salvestab kohe. Arvet ega teadet kliendile ei saadeta.</p>
      {invoice.status==='paid'&&<p className="invoice-paid-note">Arve on makstud arvete arhiivis. „Arve makstud” linnukese eemaldamine avab selle uuesti tasumata arvena.</p>}
      <label>Arve saaja / maksja<input name="payerName" maxLength={200} defaultValue={invoice.payer_name??defaultPayer} placeholder="Ettevõtte või inimese nimi"/></label>
      <div className="form-grid two">
        <label>Arve summa, €<input name="amount" inputMode="decimal" required={override} value={amount} onChange={e=>{setAmount(e.target.value);setOverride(true)}}/></label>
        <label>Arve number (vabatahtlik)<input name="number" maxLength={100} defaultValue={invoice.invoice_number??''}/></label>
      </div>
      <small className="muted">{override?'Arve käsitsi määratud summa. Töö hinda ega palkasid see ei muuda.':invoice.status==='draft'?'Summa töö hinnast.':'Esitamisel salvestatud summa.'} Käibemaksu äpp eraldi ei lisa; KM info pole töö hinnastuses määratud.</small>
      <div className="form-grid two">
        <label>Arve esitamise kuupäev<input name="issuedOn" type="date" required min="2000-01-01" max="2099-12-31" value={issued} onChange={e=>changeIssued(e.target.value)}/></label>
        <label>Maksetähtaeg päevades<input type="number" min={0} max={3650} step={1} required value={days} onChange={e=>{
          setDays(e.target.value)
          try {setDue(addCalendarDays(issued,Number(e.target.value)));setLocalError('')}catch{setLocalError('Kontrolli maksetähtaega.')}
        }}/></label>
        <label>Maksetähtaja kuupäev<input name="dueOn" type="date" required min={issued} max="2099-12-31" value={due} onChange={e=>{
          setDue(e.target.value);setDays(String(dayDifference(issued,e.target.value)))
        }}/></label>
        <label>Makse kuupäev<input name="paidOn" type="date" min="2000-01-01" max="2099-12-31" defaultValue={invoice.paid_on??today}/></label>
      </div>
      <button className="button primary" disabled={pending||!!localError}>{pending?'Salvestan…':'Salvesta arve andmed'}</button>
    </fieldset>
    {(state.error||localError)&&<p className="alert danger" role="alert">{state.error||localError}</p>}
    {state.success&&<p className="alert success" role="status">{state.success}</p>}
  </form>
}
