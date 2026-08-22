import { notFound } from 'next/navigation'
import { getOperatorJob } from '@/lib/queries'
import { finishJob } from '../../actions'

export default async function FinishPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params
  const query = await searchParams
  let job: any
  try { job = await getOperatorJob(id) } catch { notFound() }
  return <div className="page narrow stack-lg">
    <div><p className="eyebrow">Töö lõpetamine</p><h1>{job.object_name || job.customer?.name}</h1><p className="muted">Viimane kontroll. Punaseks ei lähe midagi — kui info on puudu, liigub töö juhile järeltegevusse.</p></div>
    {query.error && <div className="alert danger">Salvestamine ei õnnestunud. Ära loe tööd lõpetatuks enne, kui saad kinnituse.</div>}
    <form action={finishJob} className="form-card stack">
      <input type="hidden" name="id" value={job.id} />
      <div className="completion-photo-status"><span>Fotod</span><strong>{job.job_photos?.length ?? 0}</strong><small>{job.job_photos?.length ? 'Olemas' : 'Puuduvad — töö läheb järeltegevusse'}</small></div>
      <label>Tegelik km<input name="actualKm" inputMode="decimal" type="number" min="0" step="1" required /></label>
      <label>Lisamehe tunnid<input name="helperHours" inputMode="decimal" type="number" min="0" step="0.5" defaultValue={job.helper_hours ?? 0} /></label>
      <label>Lisatöö kirjeldus<textarea name="extraWorkDescription" rows={2} placeholder="Jäta tühjaks, kui lisatööd ei olnud" /></label>
      <label>Operaatori märkus<textarea name="operatorNote" rows={2} defaultValue={job.operator_note ?? ''} /></label>
      <label className="check-row"><input name="customerConfirmation" type="checkbox" /><span>Klient kinnitas töö / tulemi</span></label>
      <label className="check-row"><input name="billingConfirmed" type="checkbox" /><span>Arve saaja andmed on kontrollitud</span></label>
      <button className="button finish wide giant" type="submit">KINNITA JA LÕPETA</button>
    </form>
  </div>
}
