import Link from 'next/link'
import { StatusBadge } from './StatusBadge'
import type { JobStatus } from '@/lib/domain'
import { formatPlannedSchedule } from '@/lib/jobs'
import { claimJob, releaseJob } from '@/app/operator/actions'

export function OperatorJobCard({ job, hero = false, mode = 'mine' }: { job: any; hero?: boolean; mode?: 'free' | 'mine' }) {
  const schedule = formatPlannedSchedule(job.start_planned, job.planned_date, job.planned_time, job.planned_end_time)
  const waze = job.address ? `https://www.waze.com/ul?q=${encodeURIComponent(job.address)}&navigate=yes` : null
  const canRelease = mode === 'mine' && !job.actual_start && !['toob', 'tehtud', 'vajab_jareltegevust', 'tuhistatud'].includes(job.status)

  return (
    <section className={hero ? 'operator-card operator-hero' : 'operator-card'}>
      <div className="job-card-top"><strong>{schedule}</strong><StatusBadge status={job.status as JobStatus} /></div>
      <h2>{job.object_name || job.customer?.name || 'Töö'}</h2>
      <p className="operator-address">{job.address || 'Aadress määramata'}</p>
      <p>{job.work_type?.name || 'Tööliik määramata'}{job.description ? ` · ${job.description}` : ''}</p>

      {mode === 'free' ? <form action={claimJob}>
        <input type="hidden" name="id" value={job.id} />
        <button className="button primary wide xl" type="submit">VÕTA TÖÖ</button>
      </form> : <>
        <div className="action-grid two">
          {waze ? <a className="button secondary" href={waze} target="_blank" rel="noreferrer">Navigeeri</a> : <span className="button disabled">Aadress puudub</span>}
          {job.customer?.phone ? <a className="button secondary" href={`tel:${job.customer.phone}`}>Helista</a> : <span className="button disabled">Telefon puudub</span>}
        </div>
        <Link className="button primary wide xl" href={`/operator/jobs/${job.id}`}>{job.status === 'toob' ? 'JÄTKA TÖÖD' : 'AVA TÖÖ'}</Link>
        {canRelease && <form action={releaseJob}>
          <input type="hidden" name="id" value={job.id} />
          <button className="button secondary wide" type="submit">Vabasta töö</button>
        </form>}
      </>}
    </section>
  )
}
