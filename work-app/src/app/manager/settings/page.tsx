import { getPricingSettings, getWorkTypes } from '@/lib/queries'
import { addWorkType, toggleWorkType, updatePricing } from './actions'

export default async function SettingsPage() {
  const [pricing, workTypes] = await Promise.all([getPricingSettings(), getWorkTypes()])
  return <div className="page narrow stack-lg">
    <div><p className="eyebrow">Seaded</p><h1>Ärireeglid</h1><p className="muted">Muuda hindu siin, mitte koodis. Vana kinnitatud töö hind jääb snapshot’i tõttu puutumata.</p></div>
    <form action={updatePricing} className="form-card stack"><h2>Hinnastamine</h2><div className="form-grid two"><label>Tõstuk €/h<input name="hourlyRate" type="number" min="0" step="0.01" defaultValue={pricing.hourlyRate} /></label><label>Miinimum €<input name="minimumOrder" type="number" min="0" step="0.01" defaultValue={pricing.minimumOrder} /></label></div><div className="form-grid three"><label>Sõit €/h<input name="driveHourlyRate" type="number" min="0" step="0.01" defaultValue={pricing.driveHourlyRate} /></label><label>Km €/km<input name="kmRate" type="number" min="0" step="0.01" defaultValue={pricing.kmRate} /></label><label>Lisamees €/h<input name="helperHourlyRate" type="number" min="0" step="0.01" defaultValue={pricing.helperHourlyRate} /></label></div><button className="button primary">Salvesta hinnad</button></form>
    <section className="detail-card"><h2>Tööliigid</h2><div className="settings-list">{workTypes.map((w: any) => <div key={w.id}><span><strong>{w.name}</strong>{w.seasonal && <small>hooajaline</small>}</span><form action={toggleWorkType}><input type="hidden" name="id" value={w.id} /><input type="hidden" name="active" value={String(w.active)} /><button className="text-button">{w.active ? 'Peida' : 'Aktiveeri'}</button></form></div>)}</div><form action={addWorkType} className="inline-form"><input name="name" placeholder="Uus tööliik" required /><label className="check-row compact"><input type="checkbox" name="seasonal" /><span>Hooajaline</span></label><button className="button secondary">Lisa</button></form></section>
  </div>
}
