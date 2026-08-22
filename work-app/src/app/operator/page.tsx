import { requireUser } from '@/lib/session'
import { getOperatorTodayJobs } from '@/lib/queries'
import { OperatorJobCard } from '@/components/OperatorJobCard'

export default async function OperatorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser('operator')
  const [jobs, params] = await Promise.all([getOperatorTodayJobs(user.id), searchParams])
  const active = jobs.find((j: any) => j.status === 'toob')
  const next = active ?? jobs.find((j: any) => ['kinnitatud','teel'].includes(j.status)) ?? jobs[0]
  const rest = jobs.filter((j: any) => j.id !== next?.id)
  return <div className="page stack-lg operator-page">
    <div><p className="eyebrow">Operaator</p><h1>Täna</h1><p className="muted">{new Intl.DateTimeFormat('et-EE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Tallinn' }).format(new Date())}</p></div>
    {params.done && <div className="alert success">Töö lõpetatud ja salvestatud.</div>}
    {params.error && <div className="alert danger">Toiming ei õnnestunud. Kontrolli ühendust ja proovi uuesti.</div>}
    {next ? <><p className="eyebrow">Järgmine töö</p><OperatorJobCard job={next} hero /></> : <div className="empty big"><strong>Tänaseks rohkem töid ei ole.</strong><span>Kui juht lisab uue töö, ilmub see siia.</span></div>}
    {rest.length > 0 && <section><h2>Veel täna</h2><div className="stack">{rest.map((job: any) => <OperatorJobCard key={job.id} job={job} />)}</div></section>}
  </div>
}
