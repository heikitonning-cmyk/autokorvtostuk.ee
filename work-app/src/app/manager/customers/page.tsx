import { getCustomers } from '@/lib/queries'
import { createCustomer } from './actions'

const euro = (v: number) => new Intl.NumberFormat('et-EE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)

export default async function CustomersPage() {
  const customers = await getCustomers()
  return <div className="page stack-lg">
    <div><p className="eyebrow">CRM</p><h1>Kliendid</h1><p className="muted">Korduvklient, ajalugu ja arveinfo jäävad ühe koha peale.</p></div>
    <details className="form-card"><summary>+ Lisa klient</summary><form action={createCustomer} className="stack top-gap"><div className="form-grid two"><label>Tüüp<select name="type" defaultValue="company"><option value="company">Ettevõte</option><option value="person">Eraisik</option></select></label><label>Nimi<input name="name" required /></label></div><div className="form-grid two"><label>Registrikood<input name="registryCode" /></label><label>Kontaktisik<input name="contactName" /></label></div><div className="form-grid two"><label>Telefon<input name="phone" inputMode="tel" /></label><label>E-post<input name="email" type="email" /></label></div><label>Arveaadress<input name="billingAddress" /></label><label>Märkus<textarea name="notes" rows={2} /></label><button className="button primary">Salvesta klient</button></form></details>
    <div className="customer-grid">{customers.map((c: any) => {
      const jobs = c.jobs ?? []
      const total = jobs.reduce((s: number, j: any) => s + Number(j.actual_total ?? j.estimated_total ?? 0), 0)
      const last = [...jobs].sort((a:any,b:any)=>new Date(b.start_planned).getTime()-new Date(a.start_planned).getTime())[0]
      return <section key={c.id} className="customer-card"><div><strong>{c.name}</strong><small>{c.contact_name || c.phone || c.email || 'Kontakt puudub'}</small></div><div className="customer-stats"><span>{jobs.length} tööd</span><span>{euro(total)}</span></div><small>Viimane: {last ? new Date(last.start_planned).toLocaleDateString('et-EE') : '—'}</small></section>
    })}</div>
  </div>
}
