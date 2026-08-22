import Link from 'next/link'
import { StatusBadge } from './StatusBadge'
import type { JobStatus } from '@/lib/domain'

export function JobCard({ job, href }: { job: any; href: string }) {
  const time = new Intl.DateTimeFormat('et-EE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Tallinn' }).format(new Date(job.start_planned))
  return (
    <Link href={href} className="job-card">
      <div className="job-card-top"><strong>{time} · {job.object_name || job.customer?.name || 'Töö'}</strong><StatusBadge status={job.status as JobStatus} /></div>
      <div className="job-address">{job.address}</div>
      <div className="job-meta"><span>{job.work_type?.name ?? 'Muu töö'}</span>{job.operator?.name && <span>{job.operator.name}</span>}</div>
    </Link>
  )
}
