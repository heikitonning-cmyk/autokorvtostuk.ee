import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getJobDetail } from '@/lib/queries'
import { StatusBadge } from '@/components/StatusBadge'
import { cancelJob, confirmJob } from '../actions'
import type { JobStatus } from '@/lib/domain'
import { formatPlannedSchedule } from '@/lib/jobs'

const dt = (v: string | null) => v ? new Intl.DateTimeFormat('et-EE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Tallinn' }).format(new Date(v)) : '—'
const money = (v: number | null) => v == null ? '—' : `${Number(v).toFixed(2)} €`
const locked = new Set(['tehtud', 'vajab_jareltegevust', 'tuhistatud'])

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params
  const query = await searchParams
  let job: any
  try { job = await getJobDetail(id) } catch { notFound() }
  const planned = formatPlannedSchedule(job.start_planned, job.planned_date, job.planned_time, job.planned_end_time)
  const editable = !locked.has(job.status)

  return <div className="page narrow stack-lg">
    <div className="page-title-row"><div><p className="eyebrow">Töö detail</p><h1>{job.object_name || job.customer?.name || 'Töö'}</h1><p className="muted">{job.address || 'Aadress määramata'}</p></div><div className="stack"><StatusBadge status={job.status as JobStatus} />{editable && <Link className="button secondary" href={`/manager/jobs/${job.id}/edit`}>Muuda</Link>}</div></div>
    {query.saved && <div className="alert success">Muudatused salvestatud.</div>}
    {job.status === 'uus' && <div className="action-grid two"><form action={confirmJob}><input type="hidden" name="id" value={job.id} /><button className="button primary wide">Kinnita töö</button></form><form action={cancelJob}><input type="hidden" name="id" value={job.id} /><button className="button danger-outline wide">Tühista</button></form></div>}
    <section className="detail-card"><h2>Aeg ja inimesed</h2><dl><div><dt>Plaan</dt><dd>{planned}</dd></div><div><dt>Klient</dt><dd>{job.customer?.name || 'Määramata'}</dd></div><div><dt>Kontakt</dt><dd>{job.customer?.phone || job.customer?.email || '—'}</dd></div><div><dt>Operaator</dt><dd>{job.operator?.name || 'Määramata'}</dd></div><div><dt>Tööliik</dt><dd>{job.work_type?.name || 'Määramata'}</dd></div></dl></section>
    <section className="detail-card"><h2>Töö</h2><p>{job.description || 'Kirjeldus puudub.'}</p>{job.access_notes && <div className="note-box"><strong>Ligipääs</strong><p>{job.access_notes}</p></div>}</section>
    <section className="detail-card"><h2>Hind</h2><dl><div><dt>Eeldus</dt><dd>{money(job.estimated_total)}</dd></div><div><dt>Tõstuk</dt><dd>{job.estimated_hours} h</dd></div><div><dt>Sõit</dt><dd>{job.estimated_drive_hours} h / {job.estimated_km} km</dd></div><div><dt>Lisamees</dt><dd>{job.estimated_helper_hours} h</dd></div><div><dt>Tegelik</dt><dd>{money(job.actual_total)}</dd></div></dl>{job.price_snapshot_json && <p className="snapshot">Hind lukustatud töö kinnitamisel: {job.price_snapshot_json.hourlyRate} €/h, km {job.price_snapshot_json.kmRate} €.</p>}</section>
    <section className="detail-card"><h2>Tegelik töö</h2><dl><div><dt>Algus</dt><dd>{dt(job.actual_start)}</dd></div><div><dt>Lõpp</dt><dd>{dt(job.actual_end)}</dd></div><div><dt>Km</dt><dd>{job.actual_km ?? '—'}</dd></div><div><dt>Lisatöö</dt><dd>{job.extra_work_description || '—'}</dd></div><div><dt>Arve</dt><dd>{job.invoice_status}</dd></div></dl></section>
    <section className="detail-card"><h2>Fotod <span className="count">{job.job_photos?.length ?? 0}</span></h2>{job.job_photos?.length ? <div className="photo-list">{job.job_photos.map((p: any) => p.signed_url ? <a key={p.id} href={p.signed_url} target="_blank" rel="noreferrer" className="photo-item"><img src={p.signed_url} alt={`Töö foto: ${p.category}`} /><small>{p.category} · {new Date(p.created_at).toLocaleString('et-EE')}</small></a> : <div key={p.id} className="photo-placeholder">{p.category}</div>)}</div> : <p className="muted">Fotosid veel ei ole.</p>}</section>
    <section className="detail-card"><h2>Muudatuste ajalugu</h2><div className="event-list">{[...(job.job_events ?? [])].sort((a:any,b:any)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).slice(0,20).map((e:any)=><div key={e.id}><strong>{e.event_type}</strong><span>{dt(e.created_at)}</span></div>)}</div></section>
  </div>
}
