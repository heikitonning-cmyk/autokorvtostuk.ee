import Link from 'next/link'
import { updateJob } from '@/app/job-edit-actions'
import type { PriceSettings } from '@/lib/domain'

function tallinnDate(value: string | null | undefined) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Tallinn', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value))
}

function tallinnTime(value: string | null | undefined) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Tallinn', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value))
}

function timeValue(value: string | null | undefined) {
  return value ? String(value).slice(0, 5) : ''
}

export function JobEditForm({
  job,
  refs,
  pricing,
  view,
  errorText,
  cancelHref,
}: {
  job: any
  refs: { customers: any[]; workTypes: any[]; vehicles: any[] }
  pricing: PriceSettings
  view: 'manager' | 'worker'
  errorText?: string
  cancelHref: string
}) {
  const plannedDate = job.planned_date || tallinnDate(job.start_planned)
  const plannedTime = timeValue(job.planned_time) || tallinnTime(job.start_planned)
  const plannedEndTime = timeValue(job.planned_end_time) || tallinnTime(job.end_planned)

  return <div className="page narrow stack-lg">
    <div><p className="eyebrow">Töö muutmine</p><h1>{job.object_name || job.customer?.name || 'Töö'}</h1><p className="muted">Kõiki lõpetamata töö planeerimisandmeid saab hiljem muuta.</p></div>
    {errorText && <div className="alert danger"><strong>Salvestusviga:</strong> {errorText}</div>}
    <form action={updateJob} className="form-card stack">
      <input type="hidden" name="id" value={job.id} />
      <input type="hidden" name="view" value={view} />
      <label>Klient<select name="customerId" defaultValue={job.customer_id ?? ''}><option value="">Klient määramata</option>{refs.customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="form-grid three"><label>Kuupäev<input name="plannedDate" type="date" defaultValue={plannedDate} /></label><label>Kellaaeg<input name="plannedTime" type="time" defaultValue={plannedTime} /><small className="muted">Tühi = “Aeg määramata”.</small></label><label>Lõpuaeg<input name="plannedEndTime" type="time" defaultValue={plannedEndTime} /></label></div>
      <div className="form-grid two"><label>Tööliik<select name="workTypeId" defaultValue={job.work_type_id ?? ''}><option value="">Tööliik määramata</option>{refs.workTypes.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label><label>Tõstuk<select name="vehicleId" defaultValue={job.vehicle_id ?? ''}><option value="">Tõstuk määramata</option>{refs.vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label></div>
      <label>Objekt / lühinimi<input name="objectName" defaultValue={job.object_name ?? ''} placeholder="nt Koivu 12" /></label>
      <label>Aadress<input name="address" defaultValue={job.address ?? ''} placeholder="Tänav, linn" /></label>
      <label>Töö kirjeldus<textarea name="description" rows={3} defaultValue={job.description ?? ''} placeholder="Mida tuleb teha?" /></label>
      <label>Ligipääs / oluline kasutajale<textarea name="accessNotes" rows={2} defaultValue={job.access_notes ?? ''} placeholder="Värav, kontakt, parkimine, ohtlik koht..." /></label>
      <div className="divider"><span>Hinna eelarve</span></div>
      <div className="form-grid three"><label>Tõstuki tunnid<input name="estimatedHours" type="number" min="0" step="0.5" defaultValue={job.estimated_hours ?? 0} /></label><label>Sõidutunnid<input name="estimatedDriveHours" type="number" min="0" step="0.5" defaultValue={job.estimated_drive_hours ?? 0} /></label><label>Km<input name="estimatedKm" type="number" min="0" step="1" defaultValue={job.estimated_km ?? 0} /></label></div>
      <div className="form-grid two"><label>Lisamehe tunnid<input name="estimatedHelperHours" type="number" min="0" step="0.5" defaultValue={job.estimated_helper_hours ?? 0} /></label><label>Käsikorrektsioon €<input name="manualAdjustment" type="number" step="1" defaultValue={job.manual_adjustment ?? 0} /></label></div>
      <label>Korrektsiooni põhjus<input name="adjustmentReason" defaultValue={job.manual_adjustment_reason ?? ''} /></label>
      <div className="price-hint">Arvutus: tõstuk {pricing.hourlyRate} €/h · miinimum {pricing.minimumOrder} € · km {pricing.kmRate} €/km · lisamees {pricing.helperHourlyRate} €/h{job.price_snapshot_json ? ' · selle töö kinnitamisel lukustatud hinnad' : ''}</div>
      <div className="action-grid two"><Link className="button secondary wide" href={cancelHref}>Tagasi</Link><button className="button primary wide xl" type="submit">Salvesta muudatused</button></div>
    </form>
  </div>
}
