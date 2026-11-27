import { requireUser } from '@/lib/session'
import { getInvoices } from '@/lib/invoice-queries'
import { tallinnDate } from '@/lib/payroll'
import { InvoicesView } from '@/components/InvoicesView'
export default async function InvoicesPage() {
  await requireUser('manager')
  const invoices=await getInvoices()
  return <div className="page invoice-page stack-lg"><div><p className="eyebrow">Euro Kapital</p><h1>Arved</h1><p className="muted">Arvete esitamise ja laekumise ülevaade.</p></div><InvoicesView invoices={invoices} today={tallinnDate()}/></div>
}
