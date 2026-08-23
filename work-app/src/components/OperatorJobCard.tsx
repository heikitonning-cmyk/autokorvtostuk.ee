import Link from 'next/link'
import { StatusBadge } from './StatusBadge'
import type { JobStatus } from '@/lib/domain'
import { formatPlannedTime } from '@/lib/jobs'

export function OperatorJobCard({ job, hero = false }: { job: any; hero?: boolean }) {
  const time = formatPlannedTime(job.start_planned, job.planned_time)
  const waze = job.address ? `https://www.waze.com/ul?q=${encodeURIComponent(job.address)}&navigate=yes` : null
  return (
    <section className={hero ? 'operator-card operator-hero' : 'operator-card'}>
      <div className="job-card-top"><strong>{time}</strong><StatusBadge status={job.status as JobStatus} /></div>
      <h2>{job.object_name || job.customer?.name || 'Töö'}</h2>
      <p className="operator-address">{job.address || 'Aadress määramata'}</p>
      <p>{job.work_type?.name || 'Tööliik määramata'}{job.description ? ` · ${job.description}` : ''}</p>
      <div className="action-grid two">
        {waze ? <a className="button secondary" href={waze} target="_blank" rel="noreferrer">Navigeeri</a> : <span className="button disabled">Aadress puudub</span>}
        {job.customer?.phone ? <a className="button secondary" href={`tel:${job.customer.phone}`}>Helista</a> : <span className="button disabled">Telefon puudub</span>}
      </div>
      <Link className="button primary wide xl" href={`/operator/jobs/${job.id}`}>{job.status === 'toob' ? 'JÄTKA TÖÖD' : 'AVA TÖÖ'}</Link>
    </section>
  )
}
