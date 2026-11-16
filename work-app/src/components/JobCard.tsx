import Link from 'next/link'
import { euros, hours } from '@/lib/payroll'
import { appointmentMinutes } from '@/lib/customer-pricing'
import { formatPlannedTime } from '@/lib/jobs'

export function JobCard({ job, href }: { job: any; href: string }) {
  const time = formatPlannedTime(job.start_planned, job.planned_time)
  const duration=appointmentMinutes(job.planned_time??'',job.planned_end_time??'')
  return (
    <Link href={href} className="job-card">
      <div className="job-card-top"><strong>{time}{job.planned_end_time?`–${job.planned_end_time.slice(0,5)}`:''}</strong>{job.status==='tuhistatud'&&<small>Tühistatud</small>}</div>
      <div className="job-address"><strong>{job.address || 'Aadress määramata'}</strong></div>
      <div className="day-team-heading"><small>{duration!==null?hours(duration):''}</small>{job.estimated_total!=null&&<strong>{euros(Math.round(Number(job.estimated_total)*100))}</strong>}</div>
      <div className="job-meta">{job.description&&<span>{job.description}</span>}{(job.driver_name || (!job.dispatch_managed && job.operator?.name)) && <span>Juht: {job.driver_name || (!job.dispatch_managed && job.operator?.name)}</span>}</div>
    </Link>
  )
}
