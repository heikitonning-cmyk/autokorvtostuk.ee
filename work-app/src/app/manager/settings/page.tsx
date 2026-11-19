import { PhotoArchiveSettings } from '@/components/PhotoArchiveSettings'
import { getPricingSettings, getWorkTypes } from '@/lib/queries'
import { addWorkType, toggleWorkType } from './actions'

import { PricingSettingsForm } from '@/components/PricingSettingsForm'

export default async function SettingsPage() {
  const [pricing, workTypes] = await Promise.all([getPricingSettings(), getWorkTypes()])
  return <div className="page narrow stack-lg">
    <div><p className="eyebrow">Seaded</p><h1>Seaded</h1><p className="muted">Üldhinnad täidavad uue objekti hinnad. Iga objekti juures saad teha erikokkuleppe; varem salvestatud hinnad säilivad.</p></div>
    <PhotoArchiveSettings/>
    <PricingSettingsForm pricing={pricing}/>
    <section className="detail-card"><h2>Tööliigid</h2><div className="settings-list">{workTypes.map((w: any) => <div key={w.id}><span><strong>{w.name}</strong>{w.seasonal && <small>hooajaline</small>}</span><form action={toggleWorkType}><input type="hidden" name="id" value={w.id} /><input type="hidden" name="active" value={String(w.active)} /><button className="text-button">{w.active ? 'Peida' : 'Aktiveeri'}</button></form></div>)}</div><form action={addWorkType} className="inline-form"><input name="name" placeholder="Uus tööliik" required /><label className="check-row compact"><input type="checkbox" name="seasonal" /><span>Hooajaline</span></label><button className="button secondary">Lisa</button></form></section>
  </div>
}
