'use client'
import Link from 'next/link'
import { useState } from 'react'
import { euros } from '@/lib/payroll'
import { invoiceTotals,invoiceMatches,invoiceCustomer,invoiceDate,dueLabel,type InvoiceWithJob,type InvoiceState } from '@/lib/invoices'
import { InvoiceBadge } from '@/components/InvoiceBadge'
export function InvoicesView({invoices,today}:{invoices:InvoiceWithJob[];today:string}) {
  const [view,setView]=useState<InvoiceState|'active'>('active'),[search,setSearch]=useState('')
  const total=invoiceTotals(invoices,today)
  const rows=invoices.filter(i=>(view==='active'?i.status!=='paid':i.status===view)&&invoiceMatches(i,search))
    .sort((a,b)=>view==='paid'?(b.paid_on??'').localeCompare(a.paid_on??''):(a.due_on??'9999').localeCompare(b.due_on??'9999'))
  const sections:InvoiceState[]=view==='active'?['draft','unpaid']:[view]
  const names={draft:'Arve tegemata',unpaid:'Tasumata',paid:'Makstud'}
  return <div className="stack-lg">
    <div className="invoice-totals">
      <div className="detail-card"><span>Esitamata arvete summa</span><strong>{euros(total.draft)}</strong>{total.unknown>0&&<small>Lisaks {total.unknown} määramata summaga tööd</small>}</div>
      <div className="detail-card"><span>Tasumata arvete summa</span><strong>{euros(total.unpaid)}</strong></div>
      <div className="detail-card invoice-overdue-total"><span>Tähtaja ületanud summa</span><strong>{euros(total.overdue)}</strong></div>
    </div>
    <nav className="segmented invoice-tabs" aria-label="Arvete jaotused">{(['active','draft','unpaid','paid'] as const).map(tab=>
      <button type="button" key={tab} className={view===tab?'active':''} aria-pressed={view===tab} onClick={()=>setView(tab)}>{tab==='active'?'Aktiivsed':names[tab]}</button>)}</nav>
    <label>Otsi tellijat, objekti, kuupäeva või arvenumbrit<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Näiteks tellija nimi või 19.11.2026"/></label>
    {sections.map(section=><section className="stack" key={section}><h2>{names[section]}{section==='paid'?' · arhiiv':''}</h2>
      {rows.filter(i=>i.status===section).map(i=><Link className="detail-card invoice-list-card" key={i.job_id} href={`/manager/invoices/${i.job_id}`}>
        <div className="day-team-heading"><strong>{invoiceCustomer(i)}</strong><InvoiceBadge invoice={i} today={today}/></div>
        <p>{i.job?.address||i.job?.object_name||'Aadress määramata'}</p>
        <div className="day-team-heading"><span>Töö {invoiceDate(i.job?.planned_date??null)}{i.invoice_number?` · Arve ${i.invoice_number}`:''}</span><strong>{i.amount_cents===null?'Summa määramata':euros(Number(i.amount_cents))}</strong></div>
        {i.status!=='draft'&&<div className="invoice-dates"><span>Esitatud {invoiceDate(i.issued_on)}</span><span>Tähtaeg {invoiceDate(i.due_on)}</span>
          {i.status==='paid'?<span>Makstud {invoiceDate(i.paid_on)}</span>:<strong className={i.due_on&&i.due_on<today?'invoice-late':''}>{dueLabel(i.due_on,today)}</strong>}</div>}
      </Link>)}
      {!rows.some(i=>i.status===section)&&<p className="empty">{search?'Otsingule vastavaid arveid ei ole.':section==='paid'?'Makstud arveid veel ei ole.':section==='draft'?'Arve tegemist ootavaid töid ei ole.':'Tasumata arveid ei ole.'}</p>}
    </section>)}
    <p className="muted">Varasema lõpetatud töö arvete jälgimise saad aktiveerida töö detailvaates. Arved koostatakse ja saadetakse e-arveldajas.</p>
  </div>
}
