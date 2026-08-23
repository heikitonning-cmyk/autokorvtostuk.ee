import { requireView } from '@/lib/session'
import { getWorkerJobs } from '@/lib/queries'
import { OperatorJobCard } from '@/components/OperatorJobCard'

export default async function OperatorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireView('worker')
  const [{ freeJobs, mineJobs }, params] = await Promise.all([getWorkerJobs(user.id), searchParams])
  const active = mineJobs.find((job: any) => job.status === 'toob')
  const mineRest = mineJobs.filter((job: any) => job.id !== active?.id)
  const errorText = Array.isArray(params.error) ? params.error[0] : params.error

  return <div className="page stack-lg operator-page">
    <div><p className="eyebrow">Kasutaja</p><h1>Tööd</h1><p className="muted">Vali vaba töö endale või jätka oma tööga.</p></div>
    {params.claimed && <div className="alert success">Töö on nüüd sinu.</div>}
    {params.released && <div className="alert success">Töö vabastati ja on jälle teistele nähtav.</div>}
    {params.done && <div className="alert success">Töö lõpetatud ja salvestatud.</div>}
    {errorText && <div className="alert danger">{errorText}</div>}

    {active && <section><p className="eyebrow">Minu aktiivne töö</p><OperatorJobCard job={active} hero mode="mine" /></section>}

    <section>
      <div className="section-title"><h2>Minu tööd</h2><span className="count">{mineRest.length}</span></div>
      <div className="stack">{mineRest.length ? mineRest.map((job: any) => <OperatorJobCard key={job.id} job={job} mode="mine" />) : <div className="empty">Sul ei ole praegu võetud töid.</div>}</div>
    </section>

    <section>
      <div className="section-title"><h2>Vabad tööd</h2><span className="count">{freeJobs.length}</span></div>
      <div className="stack">{freeJobs.length ? freeJobs.map((job: any) => <OperatorJobCard key={job.id} job={job} mode="free" />) : <div className="empty">Vabu töid praegu ei ole.</div>}</div>
    </section>
  </div>
}
