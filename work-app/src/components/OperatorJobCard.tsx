import Link from 'next/link'
import { StatusBadge } from './StatusBadge'
import type { JobStatus } from '@/lib/domain'

export function OperatorJobCard({ job, hero = false }: { job: any; hero?: boolean }) {
  const time = new Intl.DateTimeFormat('et-EE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Tallinn' }).format(new Date(job.start_planned))
  const map = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`
  return (
    <section className={hero ? 'operator-card operator-hero' : 'operator-card'}>
      <div className="job-card-top"><strong>{time}</strong><StatusBadge status={job.status as JobStatus} /></div>
      <h2>{job.object_name || job.customer?.name || 'Töö'}</h2>
      <p className="operator-address">{job.address}</p>
      <p>{job.work_type?.name}{job.description ? ` · ${job.description}` : ''}</p>
      <div className="action-grid two">
        <a className="button secondary" href={map} target="_blank" rel="noreferrer">Navigeeri</a>
        {job.customer?.phone ? <a className="button secondary" href={`tel:${job.customer.phone}`}>Helista</a> : <span className="button disabled">Telefon puudub</span>}
      </div>
      <Link className="button primary wide xl" href={`/operator/jobs/${job.id}`}>{job.status === 'toob' ? 'JÄTKA TÖÖD' : 'AVA TÖÖ'}</Link>
    </section>
  )
}
