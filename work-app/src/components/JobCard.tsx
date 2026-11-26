import Link from 'next/link'
import { InvoiceBadge } from '@/components/InvoiceBadge'
import { tallinnDate } from '@/lib/payroll'
import { euros, hours } from '@/lib/payroll'
import { appointmentMinutes } from '@/lib/customer-pricing'
import { formatPlannedTime } from '@/lib/jobs'

export function JobCard({ job, href, driverPay }: { job: any; href: string; driverPay?: {cents:number;running:number} }) {
  const photoCount=Number(job.photo_stats?.[0]?.count??0)
  const invoice=Array.isArray(job.invoice)?job.invoice[0]:job.invoice
  const time = formatPlannedTime(job.start_planned, job.planned_time)
  const duration=appointmentMinutes(job.planned_time??'',job.planned_end_time??'')
  return (
    <Link href={href} className="job-card">
      <div className="job-card-top"><strong>{time}{job.planned_end_time?`–${job.planned_end_time.slice(0,5)}`:''}</strong><span style={{display:'inline-flex',alignItems:'center',gap:10}}>{photoCount>0&&<span title={`${photoCount} ${photoCount===1?'foto':'fotot'} lisatud`} style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:13,fontWeight:700,color:'#175cd3',background:'#eff8ff',padding:'4px 8px',borderRadius:999,whiteSpace:'nowrap'}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 5l1.5-2h5L16 5h4a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V7a2 2 0 012-2z"/><circle cx="12" cy="13" r="4"/></svg>{photoCount} {photoCount===1?'foto':'fotot'}</span>}{job.status==='tuhistatud'&&<small>Tühistatud</small>}</span></div>
      <div className="job-address"><strong>{job.address || 'Aadress määramata'}</strong></div>
      <div className="day-team-heading"><small>{duration!==null?hours(duration):''}</small>{job.estimated_total!=null&&<strong>{euros(Math.round(Number(job.estimated_total)*100))}</strong>}</div>
      <div className="job-meta">{job.description&&<span>{job.description}</span>}{(job.driver_name || (!job.dispatch_managed && job.operator?.name)) && <span>Juht: {job.driver_name || (!job.dispatch_managed && job.operator?.name)}{driverPay&&<> · päeva palk {euros(driverPay.cents)}{driverPay.running?' + lõpetamata tööaeg':''}</>}</span>}</div>
      {invoice&&<div className="top-gap"><InvoiceBadge invoice={invoice} today={tallinnDate()}/></div>}
    </Link>
  )
}
