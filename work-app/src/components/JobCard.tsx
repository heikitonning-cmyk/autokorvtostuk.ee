import Link from 'next/link'
import { StatusBadge } from './StatusBadge'
import type { JobStatus } from '@/lib/domain'
import { formatPlannedTime } from '@/lib/jobs'

export function JobCard({ job, href }: { job: any; href: string }) {
  const time = formatPlannedTime(job.start_planned)
  return (
    <Link href={href} className="job-card">
      <div className="job-card-top"><strong>{time} · {job.object_name || job.customer?.name || 'Töö'}</strong><StatusBadge status={job.status as JobStatus} /></div>
      <div className="job-address">{job.address || 'Aadress määramata'}</div>
      <div className="job-meta"><span>{job.work_type?.name ?? 'Tööliik määramata'}</span>{job.operator?.name && <span>{job.operator.name}</span>}</div>
    </Link>
  )
}
