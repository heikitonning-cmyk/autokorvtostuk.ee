import { createJob } from '../actions'
import { getPricingSettings, getReferenceData } from '@/lib/queries'

export default async function NewJobPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ customers, operators, workTypes, vehicles }, pricing, params] = await Promise.all([getReferenceData(), getPricingSettings(), searchParams])
  const errorText = Array.isArray(params.error) ? params.error[0] : params.error

  return <div className="page narrow stack-lg">
    <div><p className="eyebrow">Uus töö</p><h1>Lisa töö</h1><p className="muted">Kõik väljad on vabatahtlikud. Pane kirja ainult see info, mis sul praegu olemas on.</p></div>
    {errorText && <div className="alert danger"><strong>Salvestusviga:</strong> {errorText}</div>}
    <form action={createJob} className="form-card stack">
      <div className="form-grid two"><label>Klient<select name="customerId" defaultValue=""><option value="">Klient määramata</option>{customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Operaator<select name="operatorId" defaultValue=""><option value="">Operaator määramata</option>{operators.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label></div>
      <div className="form-grid three"><label>Kuupäev<input name="plannedDate" type="date" /></label><label>Kellaaeg<input name="plannedTime" type="time" /><small className="muted">Tühi = “Aeg määramata”.</small></label><label>Lõpuaeg<input name="plannedEndTime" type="time" /></label></div>
      <div className="form-grid two"><label>Tööliik<select name="workTypeId" defaultValue=""><option value="">Tööliik määramata</option>{workTypes.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label><label>Tõstuk<select name="vehicleId" defaultValue=""><option value="">Tõstuk määramata</option>{vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label></div>
      <label>Objekt / lühinimi<input name="objectName" placeholder="nt Koivu 12" /></label>
      <label>Aadress<input name="address" placeholder="Tänav, linn" /></label>
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
