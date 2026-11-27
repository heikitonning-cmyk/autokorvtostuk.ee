import { validDate } from './payroll.ts'
export type InvoiceState='draft'|'unpaid'|'paid'
export type TrackedInvoice={
  payer_name?:string|null;job_id:string;status:InvoiceState;amount_cents:number|null;amount_override:boolean;invoice_number:string|null
  issued_on:string|null;due_on:string|null;paid_on:string|null;version:number;updated_at:string;updated_by:string|null
}
export type InvoiceWithJob=TrackedInvoice&{job:{id:string;address:string|null;object_name:string|null;planned_date:string|null;estimated_total:number|null;customer:{name:string}|null;website_booking_details?:{name?:string;customerName?:string;customer_name?:string;contact_name?:string}|null}|null}
export function addCalendarDays(date:string,days:number):string {
  if(!validDate(date)||!Number.isInteger(days)||days<0||days>3650) throw new Error('Kontrolli maksetähtaega.')
  const result=new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10)
  if(!validDate(result)) throw new Error('Kuupäev peab jääma aastatesse 2000–2099.')
  return result
}
export function dayDifference(from:string,to:string):number {
  return Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000)
}
export function invoiceBadge(invoice:Pick<TrackedInvoice,'status'|'due_on'>,today:string) {
  if(invoice.status==='paid') return {label:'Makstud',tone:'paid'}
  if(invoice.status==='draft') return {label:'Arve tegemata',tone:'draft'}
  return invoice.due_on&&invoice.due_on<today?{label:'Maksetähtaeg ületatud',tone:'overdue'}:{label:'Tasumata',tone:'unpaid'}
}
export function dueLabel(due:string|null,today:string):string {
  if(!due) return ''
  const days=dayDifference(today,due)
  return days<0?`Tähtaeg ületatud ${-days} päeva`:days===0?'Tähtaeg täna':`Tähtajani ${days} päeva`
}
export const invoiceDate=(date:string|null)=>date?date.split('-').reverse().join('.'):'—'
export const invoiceCustomer=(invoice:InvoiceWithJob)=>invoice.payer_name?.trim()||invoice.job?.customer?.name||invoice.job?.website_booking_details?.customer_name||invoice.job?.website_booking_details?.contact_name||invoice.job?.website_booking_details?.customerName||invoice.job?.website_booking_details?.name||'Tellija määramata'
export function invoiceTotals(invoices:TrackedInvoice[],today:string) {
  return invoices.reduce((s,i)=>{
    if(i.status==='draft'){s.draft+=Number(i.amount_cents??0);if(i.amount_cents===null)s.unknown++}
    if(i.status==='unpaid'){s.unpaid+=Number(i.amount_cents??0);if(i.due_on&&i.due_on<today)s.overdue+=Number(i.amount_cents??0)}
    return s
  },{draft:0,unpaid:0,overdue:0,unknown:0})
}
export function invoiceMatches(i:InvoiceWithJob,query:string) {
  const dates=[i.job?.planned_date,i.issued_on,i.due_on,i.paid_on].filter(Boolean) as string[]
  return [invoiceCustomer(i),i.job?.customer?.name,i.job?.address,i.job?.object_name,i.invoice_number,...dates,...dates.map(invoiceDate)]
    .join(' ').toLocaleLowerCase('et-EE').includes(query.trim().toLocaleLowerCase('et-EE'))
}
export function parseInvoiceAmount(value:string):number {
  const normalized=value.trim().replace(',','.')
  if(!/^\d{1,9}(\.\d{1,2})?$/.test(normalized)) throw new Error('Sisesta summa kuni kahe komakohaga.')
  const [whole,fraction='']=normalized.split('.')
  const amount=Number(whole)*100+Number(fraction.padEnd(2,'0'))
  if(amount>99999999999) throw new Error('Arve summa on liiga suur.')
  return amount
}
