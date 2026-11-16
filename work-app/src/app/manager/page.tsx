import Link from 'next/link'
import { JobCard } from '@/components/JobCard'
import { getManagerJobs } from '@/lib/queries'
import { requireUser } from '@/lib/session'
import { tallinnDate } from '@/lib/payroll'

export default async function ManagerPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  await requireUser('manager')
  const jobs=await getManagerJobs(),query=await searchParams,today=tallinnDate()
  const view=query.view==='history'?'history':query.view==='all'?'all':'active'
  const visible=jobs.filter((j:any)=>view==='all'||(j.status!=='tuhistatud'&&(view==='history'?j.planned_date&&j.planned_date<today:!j.planned_date||j.planned_date>=today)))
  const dates=[...new Set(visible.map((j:any)=>j.planned_date as string|null))].sort((a,b)=>!a?1:!b?-1:view==='history'?b.localeCompare(a):a.localeCompare(b))
  return <div className="page stack-lg"><div className="page-title-row"><div><p className="eyebrow">Euro Kapital</p><h1>Tööplaan</h1></div><Link className="button primary" href="/manager/jobs/new">+ Lisa töö</Link></div>
    {query.deleted&&<p className="alert success">Töö kustutatud.</p>}
    <nav className="segmented" aria-label="Tööde valik"><Link href="/manager" className={view==='active'?'active':''}>Tänased ja tulevased</Link><Link href="?view=history" className={view==='history'?'active':''}>Varasemad</Link><Link href="?view=all" className={view==='all'?'active':''}>Kõik</Link></nav>
    <div className="stack-lg">{dates.map(date=><section className="stack" key={date??'undated'}><div className="day-team-heading"><h2>{date===today?'Täna · ':''}{date?new Date(`${date}T12:00:00Z`).toLocaleDateString('et-EE',{weekday:'long',day:'numeric',month:'long'}):'Aeg määramata'}</h2>{date&&<Link className="text-button" href={`/manager/time/days/${date}`}>Muuda päeva →</Link>}</div><div className="job-list">{visible.filter((j:any)=>j.planned_date===date).map((job:any)=><JobCard key={job.id} job={job} href={`/manager/jobs/${job.id}`}/>)}</div></section>)}{!visible.length&&<div className="empty">Selles vaates töid ei ole.</div>}</div>
  </div>
}
