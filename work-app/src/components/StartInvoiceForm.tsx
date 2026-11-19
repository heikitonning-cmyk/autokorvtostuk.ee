'use client'
import { startTransition,useActionState } from 'react'
import { startInvoice,type InvoiceActionState } from '@/app/manager/invoices/actions'
export function StartInvoiceForm({jobId,completed}:{jobId:string;completed:boolean}) {
  const [state,action,pending]=useActionState(startInvoice,{} as InvoiceActionState)
  return <form action={action} className="stack">
    <input type="hidden" name="jobId" value={jobId}/>
    <input type="hidden" name="complete" value={completed?'no':'yes'}/>
    {completed?<button className="button secondary" disabled={pending}>{pending?'Avan…':'Aktiveeri selle töö arvete jälgimine'}</button>:
      <label className="check-row invoice-completion"><input type="checkbox" checked={false} disabled={pending} onChange={()=>{
        const form=new FormData();form.set('jobId',jobId);form.set('complete','yes');startTransition(()=>action(form))
      }}/>{pending?'Salvestan…':'Töö lõpetatud'}</label>}
    {!completed&&<small className="muted">Märkimisel ilmub töö jaotusesse „Arve tegemata”.</small>}
    {state.error&&<p className="alert danger" role="alert">{state.error}</p>}
  </form>
}
