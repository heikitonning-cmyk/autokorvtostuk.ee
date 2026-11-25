import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { DeliveryInvoiceLine } from '@/components/DeliveryInvoiceLine'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/session'
import { getInvoice,getInvoiceHistory } from '@/lib/invoice-queries'
import { getJobDetail } from '@/lib/queries'
import { euros,tallinnDate } from '@/lib/payroll'
import { invoiceDate,invoiceCustomer,type InvoiceWithJob } from '@/lib/invoices'
import { InvoiceBadge } from '@/components/InvoiceBadge'
import { InvoiceForm } from '@/components/InvoiceForm'
export default async function InvoicePage({params}:{params:Promise<{id:string}>}) {
  await requireUser('manager')
  const {id}=await params
  if(!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const invoice=await getInvoice(id)
  if(!invoice) notFound()
  const [job,history]=await Promise.all([getJobDetail(id),getInvoiceHistory(id)])
  const supabase=await createClient()
  const {data:sheet,error:sheetError}=await supabase.from('job_delivery_sheets').select('sheet_number,snapshot').eq('job_id',id).maybeSingle()
  if(sheetError) throw sheetError
  const today=tallinnDate()
  return <div className="page narrow invoice-page stack-lg"><Link href="/manager/invoices" className="back-link">Arvete juurde</Link>
    <div className="page-title-row"><h1>{invoice.invoice_number?`Arve ${invoice.invoice_number}`:'Arve jälgimine'}</h1><InvoiceBadge invoice={invoice} today={today}/></div>
    <section className="detail-card stack"><h2>{invoiceCustomer({...invoice,job} as InvoiceWithJob)}</h2><p>{job.address||job.object_name||'Aadress määramata'}</p>
      <p>Töö kuupäev {invoiceDate(job.planned_date)} · Töö hind {job.estimated_total==null?'määramata':euros(Math.round(Number(job.estimated_total)*100))}</p>
      <Link href={`/manager/jobs/${id}`}>Ava seotud töö</Link>
      <small className="muted" style={{display:'block',overflowWrap:'anywhere'}}>Töö ID: {id}</small>
    </section>
    {sheet&&<section className="detail-card stack"><h2>Arve saatelehe alusel</h2><DeliveryInvoiceLine number={sheet.sheet_number} total={sheet.snapshot.total}/><Link href={`/manager/jobs/${id}`}>Ava saateleht nr {sheet.sheet_number}</Link></section>}
    <section className="form-card"><InvoiceForm key={invoice.version} invoice={invoice} today={today} defaultPayer={invoiceCustomer({...invoice,job} as InvoiceWithJob)==='Tellija määramata'?'':invoiceCustomer({...invoice,job} as InvoiceWithJob)}/></section>
    <details className="detail-card invoice-history"><summary>Muudatuste ajalugu ({history.length})</summary>
      <div className="stack top-gap">{history.map(event=><div key={event.id} className="invoice-history-row">
        <strong>{new Date(event.changed_at).toLocaleString('et-EE',{timeZone:'Europe/Tallinn'})} · {event.actor?.name??'Süsteem'}</strong>
        <p>{event.previous_data?'Muudetud':'Jälgimine aktiveeritud'} · {{draft:'Arve tegemata',unpaid:'Tasumata',paid:'Makstud'}[event.new_data.status as 'draft'|'unpaid'|'paid']} · {event.new_data.amount_cents==null?'Summa määramata':euros(Number(event.new_data.amount_cents))}</p>
        {event.new_data.payer_name&&<p>Arve saaja / maksja: {event.new_data.payer_name}</p>}
        <small>Esitatud {invoiceDate(event.new_data.issued_on)} · tähtaeg {invoiceDate(event.new_data.due_on)} · makstud {invoiceDate(event.new_data.paid_on)}{event.new_data.invoice_number?` · nr ${event.new_data.invoice_number}`:''}</small>
      </div>)}</div>
    </details>
  </div>
}
