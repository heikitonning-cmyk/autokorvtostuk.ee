import { customerPrice } from '@/lib/customer-pricing'
import { euros, hours } from '@/lib/payroll'
export function CustomerPriceSummary({job}:{job:any}) {
  if(!job.customer_pricing) return job.estimated_total==null?null:<section className="detail-card"><h2>Hind tellijale</h2><strong>{euros(Math.round(Number(job.estimated_total)*100))}</strong></section>
  const p=job.customer_pricing,result=customerPrice(p,job.planned_time??'',job.planned_end_time??'')
  const rows=[['Tõstuk'+(p.driver_rate===0?' koos juhiga':''),result.lift],['Juht',result.driver],['Juht teeb töö',result.operator],[`Abilised (${p.helper_count})`,result.helper],['Sõit',result.drive],['Transport',result.distance],['Hinnakorrektsioon',p.adjustment],['Miinimumtasu täitmine',result.calculated===null?0:result.minimumTopUp]] as [string,number][]
  return <section className="detail-card stack"><div className="day-team-heading"><h2>Hind tellijale</h2><strong>{result.total==null?'Hind määramata':euros(result.total)}</strong></div>{result.actualMinutes!==null&&<p>Tööaeg {hours(result.actualMinutes)}</p>}{result.minutes!==null&&result.minutes!==result.actualMinutes&&<small>Arvestatav aeg {hours(result.minutes)}</small>}{rows.filter(([,n])=>n!==0).map(([label,n])=><div className="customer-charge-row" key={label}><span>{label}</span><strong>{euros(n)}</strong></div>)}{p.agreed_total!==null&&<p className="customer-agreement">Kokkulepitud lõpphind {euros(p.agreed_total)}</p>}</section>
}
