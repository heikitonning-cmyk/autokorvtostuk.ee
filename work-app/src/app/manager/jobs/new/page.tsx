import { createJob } from '../actions'
import { getPricingSettings, getReferenceData } from '@/lib/queries'

export default async function NewJobPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ customers, operators, workTypes, vehicles }, pricing, params] = await Promise.all([getReferenceData(), getPricingSettings(), searchParams])
  return <div className="page narrow stack-lg">
    <div><p className="eyebrow">Uus töö</p><h1>Lisa töö</h1><p className="muted">Pane kirja see, mida operaator peab objektil teadma. Hinna saad hiljem enne kinnitamist üle vaadata.</p></div>
    {params.error && <div className="alert danger">Töö salvestamine ei õnnestunud. Kontrolli kohustuslikke välju.</div>}
    <form action={createJob} className="form-card stack">
      <div className="form-grid two"><label>Klient<select name="customerId" required defaultValue=""><option value="" disabled>Vali klient</option>{customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Operaator<select name="operatorId" required defaultValue=""><option value="" disabled>Vali operaator</option>{operators.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label></div>
      <div className="form-grid two"><label>Algus<input name="startPlanned" type="datetime-local" required /></label><label>Lõpp (soovi korral)<input name="endPlanned" type="datetime-local" /></label></div>
      <div className="form-grid two"><label>Tööliik<select name="workTypeId" required defaultValue=""><option value="" disabled>Vali tööliik</option>{workTypes.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label><label>Tõstuk<select name="vehicleId" defaultValue={vehicles[0]?.id ?? ''}>{vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label></div>
      <label>Objekt / lühinimi<input name="objectName" placeholder="nt Koivu 12" /></label>
      <label>Aadress<input name="address" required placeholder="Tänav, linn" /></label>
      <label>Töö kirjeldus<textarea name="description" rows={3} placeholder="Mida tuleb teha?" /></label>
      <label>Ligipääs / oluline operaatorile<textarea name="accessNotes" rows={2} placeholder="Värav, kontakt, parkimine, ohtlik koht..." /></label>
      <div className="divider"><span>Hinna eelarve</span></div>
      <div className="form-grid three"><label>Tõstuki tunnid<input name="estimatedHours" type="number" min="0" step="0.5" defaultValue="2" /></label><label>Sõidutunnid<input name="estimatedDriveHours" type="number" min="0" step="0.5" defaultValue="0" /></label><label>Km<input name="estimatedKm" type="number" min="0" step="1" defaultValue="0" /></label></div>
      <div className="form-grid two"><label>Lisamehe tunnid<input name="estimatedHelperHours" type="number" min="0" step="0.5" defaultValue="0" /></label><label>Käsikorrektsioon €<input name="manualAdjustment" type="number" step="1" defaultValue="0" /></label></div>
      <label>Korrektsiooni põhjus<input name="adjustmentReason" /></label>
      <div className="price-hint">Hetkehinnad: tõstuk {pricing.hourlyRate} €/h · miinimum {pricing.minimumOrder} € · km {pricing.kmRate} €/km · lisamees {pricing.helperHourlyRate} €/h</div>
      <button className="button primary wide xl" type="submit">Salvesta töö</button>
    </form>
  </div>
}
