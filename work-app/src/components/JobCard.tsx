import Link from 'next/link'
import { formatPlannedTime } from '@/lib/jobs'

export function JobCard({ job, href }: { job: any; href: string }) {
  const time = formatPlannedTime(job.start_planned, job.planned_time)
  return (
    <Link href={href} className="job-card">
      <div className="job-card-top"><strong>{time}{job.planned_end_time?`–${job.planned_end_time.slice(0,5)}`:''}</strong>{job.status==='tuhistatud'&&<small>Tühistatud</small>}</div>
      <div className="job-address"><strong>{job.address || 'Aadress määramata'}</strong></div>
      <div className="job-meta">{job.description&&<span>{job.description}</span>}{(job.driver_name || (!job.dispatch_managed && job.operator?.name)) && <span>Juht: {job.driver_name || (!job.dispatch_managed && job.operator?.name)}</span>}</div>
    </Link>
  )
}
