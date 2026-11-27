import { invoiceBadge,type TrackedInvoice } from '@/lib/invoices'
export function InvoiceBadge({invoice,today}:{invoice:Pick<TrackedInvoice,'status'|'due_on'>;today:string}) {
  const badge=invoiceBadge(invoice,today)
  return <span className={`invoice-badge invoice-${badge.tone}`}>{badge.label}</span>
}
