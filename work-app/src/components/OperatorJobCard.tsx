import Link from 'next/link'
import { StatusBadge } from './StatusBadge'
import type { JobStatus } from '@/lib/domain'
import { formatPlannedSchedule } from '@/lib/jobs'
import { JobContactActions } from './JobContactActions'
import { jobPhoneHref } from '@/lib/job-contact'

export function OperatorJobCard({ job, hero = false, mode = 'mine' }: { job: any; hero?: boolean; mode?: 'free' | 'mine' }) {
  const schedule = formatPlannedSchedule(job.start_planned, job.planned_date, job.planned_time, job.planned_end_time)
  const waze = job.address ? `https://www.waze.com/ul?q=${encodeURIComponent(job.address)}&navigate=yes` : null

  return (
    <section className={hero ? 'operator-card operator-hero' : 'operator-card'}>
      <div className="job-card-top"><strong>{schedule}</strong><StatusBadge status={job.status as JobStatus} /></div>
      <h2>{job.object_name || job.customer?.name || 'Töö'}</h2>
      <p className="operator-address">{job.address || 'Aadress määramata'}</p>
      <p>{job.work_type?.name || 'Tööliik määramata'}{job.description ? ` · ${job.description}` : ''}</p>

      {mode === 'free' ? <p className="muted">Juht määramata · määrab juhataja</p> : <>
        <JobContactActions navigationUrl={waze} phoneUrl={jobPhoneHref(job)}/>
        <Link className="button primary wide xl" href={`/operator/jobs/${job.id}`}>{job.status === 'toob' ? 'JÄTKA TÖÖD' : 'AVA TÖÖ'}</Link>
      </>}
    </section>
  )
}
