import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireView } from '@/lib/session'
import { getOperatorJob } from '@/lib/queries'
import { StatusBadge } from '@/components/StatusBadge'
import { ElapsedTimer } from '@/components/ElapsedTimer'
import { PhotoUploader } from '@/components/PhotoUploader'
import { ActiveStopCard } from '@/components/ActiveStopCard'
import { saveWorkNote, startJob } from '../actions'
import type { JobStatus } from '@/lib/domain'
import { formatPlannedSchedule } from '@/lib/jobs'
import { canFinishStops, nextPendingStop } from '@/lib/job-stops'

const locked = new Set(['tehtud', 'vajab_jareltegevust', 'tuhistatud'])

const stopErrorText: Record<string, string> = {
  'note-required': 'Peatuse lõpetamiseks või vahele jätmiseks lisa kohustuslik märkus.',
  'photo-required': 'Peatuse märkimiseks tehtuks lisa vähemalt üks foto.',
  'stop-state': 'Peatuse olek muutus. Värskendasin töö — proovi uuesti.',
  'not-assigned': 'Seda peatust saab teostada ainult töö võtnud kasutaja.',
}

export default async function OperatorJobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireView('worker')
  const { id } = await params
  const query = await searchParams
  let job: any
  try { job = await getOperatorJob(id) } catch { notFound() }
  const planned = formatPlannedSchedule(job.start_planned, job.planned_date, job.planned_time, job.planned_end_time)
  const waze = job.address ? `https://www.waze.com/ul?q=${encodeURIComponent(job.address)}&navigate=yes` : null
  const isMine = job.operator_id === user.id
  const editable = !locked.has(job.status)
  const stops = [...(job.job_stops ?? [])].sort((a: any, b: any) => Number(a.sequence_no) - Number(b.sequence_no))
  const hasStops = stops.length > 0
  const currentStop = stops.find((stop: any) => stop.status === 'in_progress') ?? nextPendingStop(stops)
  const stopsResolved = hasStops && canFinishStops(stops)
  const rawError = Array.isArray(query.error) ? query.error[0] : query.error
  const errorMessage = rawError ? (stopErrorText[rawError] ?? 'Salvestamine ei õnnestunud. Proovi uuesti.') : null

  return <div className="page narrow stack-lg operator-job">
    <div className="page-title-row"><div><p className="eyebrow">Töö</p><h1>{job.object_name || job.customer?.name || 'Töö'}</h1><p className="muted">{planned}</p></div><div className="stack"><StatusBadge status={job.status as JobStatus} />{editable && <Link className="button secondary" href={`/operator/jobs/${job.id}/edit`}>Muuda</Link>}</div></div>
    {query.saved && <div className="alert success">Muudatused salvestatud.</div>}
    {errorMessage && <div className="alert danger">{errorMessage}</div>}
    {!isMine && job.operator_id && <div className="alert">Töö on teise kasutaja võetud. Planeerimisandmeid saad siiski muuta.</div>}

    {!hasStops && <section className="detail-card important"><p className="operator-address">{waze ? <a href={waze} target="_blank" rel="noreferrer">{job.address}</a> : 'Aadress määramata'}</p><div className="action-grid two">{waze ? <a className="button secondary" href={waze} target="_blank" rel="noreferrer">Navigeeri</a> : <span className="button disabled">Aadress puudub</span>}{job.customer?.phone ? <a className="button secondary" href={`tel:${job.customer.phone}`}>Helista kliendile</a> : <span className="button disabled">Telefon puudub</span>}</div></section>}

    <section className="detail-card"><h2>Mida teha?</h2><p className="large-copy">{job.description || job.work_type?.name || 'Kirjeldus puudub.'}</p>{job.access_notes && <div className="note-box"><strong>Enne alustamist</strong><p>{job.access_notes}</p></div>}</section>

    {hasStops && <section className="detail-card"><strong>Peatused: {stops.length}</strong><p className="muted">Tehtud {stops.filter((s:any)=>s.status==='done').length} · Vahele jäetud {stops.filter((s:any)=>s.status==='skipped').length} · Ootel {stops.filter((s:any)=>s.status==='pending').length}</p></section>}

    {isMine && ['kinnitatud','teel'].includes(job.status) && <form action={startJob}><input type="hidden" name="id" value={job.id} /><button className="button primary wide giant" type="submit">ALUSTA TÖÖD</button></form>}

    {hasStops && currentStop && <ActiveStopCard jobId={job.id} stop={currentStop} canOperate={isMine && job.status === 'toob'} />}
    {hasStops && !currentStop && stopsResolved && <section className="detail-card important"><h2>Kõik peatused on lahendatud</h2><p>Võid tööpäeva lõpetada.</p></section>}

    {isMine && job.status === 'toob' && !hasStops && <>
      <ElapsedTimer startedAt={job.actual_start} />
      <section className="detail-card"><h2>Dokumenteeri töö</h2><PhotoUploader jobId={job.id} /><div className="photo-count">Fotosid: <strong>{job.job_photos?.length ?? 0}</strong></div><form action={saveWorkNote} className="stack"><input type="hidden" name="id" value={job.id} /><label>Lühimärkus<textarea name="operatorNote" rows={2} defaultValue={job.operator_note ?? ''} placeholder="Ainult kui midagi on vaja märkida" /></label><button className="button secondary wide">Salvesta märkus</button></form></section>
    </>}

    {isMine && job.status === 'toob' && (!hasStops || stopsResolved) && <Link className="button finish wide giant" href={`/operator/jobs/${job.id}/finish`}>LÕPETA TÖÖ</Link>}

    {['tehtud','vajab_jareltegevust'].includes(job.status) && <section className="detail-card"><h2>Töö on lõpetatud</h2><p>Tegelik läbisõit: <strong>{job.actual_km ?? 'puudub'} km</strong></p><p>Fotod: <strong>{job.job_photos?.length ?? 0}</strong></p><Link className="button secondary wide" href="/operator">Tagasi tööplaani</Link></section>}
  </div>
}
