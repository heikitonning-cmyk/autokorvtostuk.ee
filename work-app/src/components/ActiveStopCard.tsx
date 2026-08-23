import { ElapsedTimer } from '@/components/ElapsedTimer'
import { PhotoUploader } from '@/components/PhotoUploader'
import { completeJobStop, skipJobStop, startJobStop } from '@/app/operator/jobs/actions'
import { wazeUrl } from '@/lib/job-stops'
import type { JobStopStatus } from '@/lib/domain'

type ActiveStop = {
  id: string
  sequence_no: number
  name_snapshot: string | null
  address_snapshot: string
  description?: string | null
  status: JobStopStatus
  actual_start?: string | null
  actual_end?: string | null
  completion_note?: string | null
  job_photos?: any[]
}

const statusLabel: Record<JobStopStatus, string> = {
  pending: 'Ootel',
  in_progress: 'Töös',
  done: 'Tehtud',
  skipped: 'Vahele jäetud',
}

export function ActiveStopCard({ jobId, stop, canOperate = true }: { jobId: string; stop: ActiveStop; canOperate?: boolean }) {
  const nav = wazeUrl(stop.address_snapshot)
  const photoCount = stop.job_photos?.length ?? 0

  return <section className="detail-card important stack">
    <div>
      <p className="eyebrow">Peatus {stop.sequence_no}</p>
      <h2>{stop.name_snapshot || stop.address_snapshot}</h2>
      <a className="operator-address" href={nav} target="_blank" rel="noreferrer">{stop.address_snapshot}</a>
      {stop.description && <p>{stop.description}</p>}
    </div>

    {stop.status === 'pending' && <>
      <a className="button secondary wide giant" href={nav} target="_blank" rel="noreferrer">Navigeeri Waze'is</a>
      {canOperate && <form action={startJobStop}>
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="stopId" value={stop.id} />
        <button type="submit" className="button primary wide giant">Alusta peatust</button>
      </form>}
      {canOperate && <form action={skipJobStop} className="stack">
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="stopId" value={stop.id} />
        <label>Vahele jätmise märkus<textarea name="completionNote" rows={2} required placeholder="Miks peatus jäi tegemata?" /></label>
        <button type="submit" className="button danger-outline wide">Jäta vahele</button>
      </form>}
    </>}

    {stop.status === 'in_progress' && <>
      {stop.actual_start && <ElapsedTimer startedAt={stop.actual_start} />}
      <div><strong>Fotod: {photoCount}</strong><small className="muted" style={{ display: 'block' }}>Tehtud peatuse lõpetamiseks on vaja vähemalt 1 fotot.</small></div>
      {canOperate && <PhotoUploader jobId={jobId} jobStopId={stop.id} />}
      {canOperate && <form className="stack">
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="stopId" value={stop.id} />
        <label>Kohustuslik märkus<textarea name="completionNote" rows={3} required placeholder="Mida tegid / miks jäi tegemata?" /></label>
        <div className="action-grid two">
          <button type="submit" formAction={completeJobStop} className="button primary wide">Tehtud</button>
          <button type="submit" formAction={skipJobStop} className="button danger-outline wide">Jäta vahele</button>
        </div>
      </form>}
    </>}

    {(stop.status === 'done' || stop.status === 'skipped') && <div className="stack">
      <strong>{statusLabel[stop.status]}</strong>
      {stop.actual_start && stop.actual_end && <p className="muted">{new Date(stop.actual_start).toLocaleString('et-EE')} – {new Date(stop.actual_end).toLocaleString('et-EE')}</p>}
      <p>{stop.completion_note || 'Märkus puudub'}</p>
      <small className="muted">Fotosid: {photoCount}</small>
    </div>}
  </section>
}
