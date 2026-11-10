import { JobContactActions } from './JobContactActions'
import { StatusBadge } from './StatusBadge'
import { formatPlannedSchedule } from '@/lib/jobs'
import { jobPhoneHref } from '@/lib/job-contact'
import { wazeUrl } from '@/lib/job-stops'

export function SimpleJobDetails({ job }: { job: any }) {
  return <section className="detail-card stack">
    <div className="job-card-top"><h1>{job.object_name || job.customer?.name || 'Töö'}</h1><StatusBadge status={job.status} /></div>
    <strong>{formatPlannedSchedule(job.start_planned, job.planned_date, job.planned_time, job.planned_end_time)}</strong>
    <div className="job-address">{job.address || 'Aadress määramata'}</div>
    <p>Juht: <strong>{job.driver_name || (!job.dispatch_managed && job.operator?.name) || 'määramata'}</strong></p>
    <JobContactActions navigationUrl={job.address ? wazeUrl(job.address) : null} phoneUrl={jobPhoneHref(job)} />
    {job.description && <p className="simple-job-description">{job.description}</p>}
    {job.access_notes && <p className="simple-job-description">{job.access_notes}</p>}
    {job.job_stops?.length > 0 && <details><summary>Lisa-aadressid ({job.job_stops.length})</summary><div className="stack top-gap">{job.job_stops.map((stop: any) => <div key={stop.id} className="stack">
      <strong>{stop.name_snapshot}</strong><p>{stop.address_snapshot}</p>{stop.description && <p>{stop.description}</p>}
      {stop.address_snapshot && <a className="button secondary" href={wazeUrl(stop.address_snapshot)} target="_blank" rel="noreferrer">Navigeeri</a>}
    </div>)}</div></details>}
  </section>
}
