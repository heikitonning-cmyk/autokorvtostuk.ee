import { getCustomers } from '@/lib/queries'
import { createCustomer, createCustomerSite } from './actions'

const euro = (v: number) => new Intl.NumberFormat('et-EE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)

export default async function CustomersPage() {
  const customers = await getCustomers()
  return <div className="page stack-lg">
    <div><p className="eyebrow">CRM</p><h1>Kliendid</h1><p className="muted">Korduvklient, püsiasukohad, ajalugu ja arveinfo jäävad ühe koha peale.</p></div>
    <details className="form-card"><summary>+ Lisa klient</summary><form action={createCustomer} className="stack top-gap"><div className="form-grid two"><label>Tüüp<select name="type" defaultValue="company"><option value="company">Ettevõte</option><option value="person">Eraisik</option></select></label><label>Nimi<input name="name" required /></label></div><div className="form-grid two"><label>Registrikood<input name="registryCode" /></label><label>Kontaktisik<input name="contactName" /></label></div><div className="form-grid two"><label>Telefon<input name="phone" inputMode="tel" /></label><label>E-post<input name="email" type="email" /></label></div><label>Arveaadress<input name="billingAddress" /></label><label>Märkus<textarea name="notes" rows={2} /></label><button className="button primary">Salvesta klient</button></form></details>
    <div className="customer-grid">{customers.map((c: any) => {
      const jobs = c.jobs ?? []
      const sites = [...(c.customer_sites ?? [])].sort((a: any, b: any) => a.name.localeCompare(b.name, 'et'))
      const total = jobs.reduce((s: number, j: any) => s + Number(j.actual_total ?? j.estimated_total ?? 0), 0)
      const last = [...jobs].filter((j: any) => j.start_planned || j.planned_date).sort((a:any,b:any)=>new Date(b.start_planned ?? `${b.planned_date}T12:00:00Z`).getTime()-new Date(a.start_planned ?? `${a.planned_date}T12:00:00Z`).getTime())[0]
      return <section key={c.id} className="customer-card stack">
        <div><strong>{c.name}</strong><small>{c.contact_name || c.phone || c.email || 'Kontakt puudub'}</small></div>
        <div className="customer-stats"><span>{jobs.length} tööd</span><span>{sites.length} asukohta</span><span>{euro(total)}</span></div>
        <small>Viimane: {last ? new Date(last.start_planned ?? `${last.planned_date}T12:00:00Z`).toLocaleDateString('et-EE') : '—'}</small>
        <details>
          <summary>Asukohad · {sites.length}</summary>
          <div className="stack top-gap">
            {sites.length ? sites.map((site: any) => <div key={site.id} className="note-box">
              <strong>{site.name}</strong>
              <p>{site.address || 'Aadress määramata'}</p>
              {site.requires_lift != null && <small>{site.requires_lift ? 'Tõstuk vajalik' : 'Tõstukit ei ole vaja'}</small>}
            </div>) : <p className="muted">Püsiasukohti veel ei ole.</p>}
            <details>
              <summary>+ Lisa asukoht</summary>
              <form action={createCustomerSite} className="stack top-gap">
                <input type="hidden" name="customerId" value={c.id} />
                <label>Nimi<input name="name" required placeholder="nt Pirita" /></label>
                <label>Aadress<input name="address" placeholder="Tänav, linn" /></label>
                <label><input name="requiresLift" type="checkbox" /> Tõstuk vajalik</label>
                <button className="button secondary" type="submit">Salvesta asukoht</button>
              </form>
            </details>
          </div>
        </details>
      </section>
    })}</div>
  </div>
}
