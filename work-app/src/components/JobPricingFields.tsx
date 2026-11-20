'use client'

import { useState } from 'react'
import type { PriceSettings } from '@/lib/domain'
import { calculateJobEstimate } from '@/lib/pricing'

const euros = (value: number) => new Intl.NumberFormat('et-EE', { style: 'currency', currency: 'EUR' }).format(value)

export function JobPricingFields({ job = {}, pricing }: { job?: any; pricing: PriceSettings }) {
  const [hours, setHours] = useState(String(job.estimated_hours ?? 2))
  const [drive, setDrive] = useState(String(job.estimated_drive_hours ?? 0))
  const [km, setKm] = useState(String(job.estimated_km ?? 0))
  const [helper, setHelper] = useState(String(job.estimated_helper_hours ?? 0))
  const [adjustment, setAdjustment] = useState(String(job.manual_adjustment ?? 0))
  const [operatorWork, setOperatorWork] = useState(job.operator_does_work === true)
  const price = calculateJobEstimate(job, {
    liftHours: Number(hours) || 0, driveHours: Number(drive) || 0, km: Number(km) || 0,
    helperHours: Number(helper) || 0, adjustment: Number(adjustment) || 0, operatorDoesWork: operatorWork,
  }, pricing)
  return <>
    <div className="form-grid three">
      <label>Tõstuki töötunnid objektil<input name="estimatedHours" type="number" min="0" step="0.25" value={hours} onChange={e => setHours(e.target.value)} /></label>
      <label>Sõidutunnid<input name="estimatedDriveHours" type="number" min="0" step="0.25" value={drive} onChange={e => setDrive(e.target.value)} /></label>
      <label>Km<input name="estimatedKm" type="number" min="0" step="1" value={km} onChange={e => setKm(e.target.value)} /></label>
    </div>
    <label className="check-row"><input name="operatorDoesWork" type="checkbox" checked={operatorWork} onChange={e => setOperatorWork(e.target.checked)} /><span>Operaator teostab töö (+{pricing.operatorWorkHourlyRate ?? 15} €/h)</span></label>
    <p className="muted">Lisatasu arvestatakse ainult objektil tehtud tööajalt. Sõiduaeg ja kilometraaž sellesse ei kuulu.</p>
    <div className="form-grid two">
      <label>Lisamehe tunnid<input name="estimatedHelperHours" type="number" min="0" step="0.25" value={helper} onChange={e => setHelper(e.target.value)} /></label>
      <label>Käsikorrektsioon €<input name="manualAdjustment" type="number" step="0.01" value={adjustment} onChange={e => setAdjustment(e.target.value)} /></label>
    </div>
    <label>Korrektsiooni põhjus<input name="adjustmentReason" defaultValue={job.manual_adjustment_reason ?? ''} /></label>
    <div className="price-hint">Tõstuk {pricing.hourlyRate} €/h · miinimum {pricing.minimumOrder} € · km {pricing.kmRate} €/km · lisamees {pricing.helperHourlyRate} €/h{job.price_snapshot_json ? ' · töö kinnitamisel lukustatud hinnad' : ''}</div>
    <div className="note-box" aria-live="polite"><p>Operaatori teostatav töö: <strong>+{euros(price.operatorWork)}</strong></p><p>Eeldatav koguhind: <strong>{euros(price.total)}</strong></p></div>
  </>
}
