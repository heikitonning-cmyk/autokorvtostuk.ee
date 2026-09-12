import { JobPricingFields } from '@/components/JobPricingFields'
import { createJob } from '../actions'
import { getPricingSettings, getReferenceData } from '@/lib/queries'
import { JobLocationFields } from '@/components/JobLocationFields'
import { JobStopsEditor } from '@/components/JobStopsEditor'

export default async function NewJobPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ customers, workTypes, vehicles, sites }, pricing, params] = await Promise.all([getReferenceData(), getPricingSettings(), searchParams])
  const errorText = Array.isArray(params.error) ? params.error[0] : params.error

  return <div className="page narrow stack-lg">
    <div><p className="eyebrow">Uus töö</p><h1>Lisa töö</h1><p className="muted">Kõik väljad on vabatahtlikud. Pane kirja ainult see info, mis sul praegu olemas on. Kasutaja valib vaba töö hiljem ise.</p></div>
    {errorText && <div className="alert danger"><strong>Salvestusviga:</strong> {errorText}</div>}
    <form action={createJob} className="form-card stack">
      <JobLocationFields customers={customers} sites={sites} />
      <JobStopsEditor sites={sites} />
      <div className="form-grid three"><label>Kuupäev<input name="plannedDate" type="date" /></label><label>Kellaaeg<input name="plannedTime" type="time" /><small className="muted">Tühi = “Aeg määramata”.</small></label><label>Lõpuaeg<input name="plannedEndTime" type="time" /></label></div>
      <div className="form-grid two"><label>Tööliik<select name="workTypeId" defaultValue=""><option value="">Tööliik määramata</option>{workTypes.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label><label>Tõstuk<select name="vehicleId" defaultValue=""><option value="">Tõstuk määramata</option>{vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label></div>
      <label>Töö kirjeldus<textarea name="description" rows={3} placeholder="Mida tuleb teha?" /></label>
      <label>Ligipääs / oluline kasutajale<textarea name="accessNotes" rows={2} placeholder="Värav, kontakt, parkimine, ohtlik koht..." /></label>
      <div className="divider"><span>Hinna eelarve</span></div>
      <JobPricingFields pricing={pricing} />
      <button className="button primary wide xl" type="submit">Salvesta töö</button>
    </form>
  </div>
}
