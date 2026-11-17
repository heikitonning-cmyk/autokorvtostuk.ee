'use client'
import Link from 'next/link'
import { customerPrice, type CustomerPricing } from '@/lib/customer-pricing'
import { euros, hours } from '@/lib/payroll'

function MoneyInput({label,value,onChange,optional=false,signed=false}:{label:string;value:number|null;onChange:(value:number|null)=>void;optional?:boolean;signed?:boolean}) {
  return <label>{label}<input type="number" min={signed?undefined:0} max={9999999.99} step="0.01" required={!optional} value={value===null?'':value/100} onChange={e=>onChange(e.target.value===''?null:Math.round(Number(e.target.value)*100))}/></label>
}
function MinutesInput({label,value,onChange,optional=false}:{label:string;value:number|null;onChange:(value:number|null)=>void;optional?:boolean}) {
  return <label>{label}<input type="number" min={optional?1:0} max={1440} step={1} required={!optional} placeholder={optional?'Objekti tööaja järgi':''} value={value??''} onChange={e=>onChange(e.target.value===''?null:Number(e.target.value))}/></label>
}
export function CustomerPriceFields({value:p,start,end,onChange}:{value:CustomerPricing;start:string;end:string;onChange:(p:CustomerPricing)=>void}) {
  const change=(patch:Partial<CustomerPricing>)=>onChange({...p,...patch})
  let price:ReturnType<typeof customerPrice>|undefined,error=''
  try {price=customerPrice(p,start,end)} catch(e){error=(e as Error).message}
  return <section className="customer-price stack" aria-label="Objekti hind tellijale">
    <div className="day-team-heading"><div><h3>Hind tellijale</h3><small>{price?.actualMinutes!=null?`Tööaeg ${hours(price.actualMinutes)}`:'Tööaja jaoks sisesta algus ja lõpp'}</small></div><strong className="customer-price-total" aria-live="polite">{price?.total!=null?euros(price.total):'Hind määramata'}</strong></div>
    <div className="customer-charge-row"><label className="check-row"><input type="checkbox" checked={p.lift_enabled} onChange={e=>change({lift_enabled:e.target.checked})}/>{p.driver_rate===0?'Tõstuk koos juhiga':'Tõstuk'} <small>{euros(p.lift_rate)}/h</small></label><strong>{euros(price?.lift??0)}</strong></div>
    {p.driver_rate>0&&<div className="customer-charge-row"><span>Juht · {euros(p.driver_rate)}/h</span><strong>{euros(price?.driver??0)}</strong></div>}
    <div className="customer-charge-row"><label className="check-row"><input type="checkbox" checked={p.operator_work} onChange={e=>change({operator_work:e.target.checked})}/>Juht teeb töö <small>+{euros(p.operator_rate)}/h</small></label><strong>{euros(price?.operator??0)}</strong></div>
    <div className="customer-charge-row"><label className="helper-count">Abiliste arv<input type="number" min={0} max={50} step={1} required value={p.helper_count} onChange={e=>change({helper_count:Number(e.target.value)})}/><small>{euros(p.helper_rate)}/h inimese kohta</small></label><strong>{euros(price?.helper??0)}</strong></div>
    <div className="form-grid two">
      <label className="check-row"><input type="checkbox" checked={p.drive_minutes===60&&p.km===0} onChange={e=>change(e.target.checked?{drive_minutes:60,km:0}:{drive_minutes:0})}/>Tallinn — 1 h sõitu ({euros(p.drive_rate)})</label>
      <label>Väljaspool Tallinna: km kokku<input type="number" min={0} max={10000} step="0.01" required value={p.km} onChange={e=>{const km=Number(e.target.value);change(km>0?{km,drive_minutes:0}:{km})}}/><small className="muted">{euros(p.km_rate)}/km · sisesta arvestatav sõidumaa kokku</small></label>
    </div>
    <small className="muted">Vali Tallinna sõidutasu või sisesta kilomeetrid. Kilomeetrite sisestamine asendab Tallinna sõidutasu. Sõidule „Juht teeb töö” lisatasu ei rakendu.</small>
    {price?.minutes!=null&&price.minutes!==price.actualMinutes&&<small>Arvestatav aeg {hours(price.minutes)}</small>}
    {!!price?.drive&&<div className="customer-charge-row"><small>Sõiduaeg {hours(p.drive_minutes)}</small><strong>{euros(price.drive)}</strong></div>}
    {!!price?.distance&&<div className="customer-charge-row"><small>Transport {p.km} km</small><strong>{euros(price.distance)}</strong></div>}
    {!!p.adjustment&&<div className="customer-charge-row"><small>Hinnakorrektsioon</small><strong>{euros(p.adjustment)}</strong></div>}
    {price?.calculated!=null&&price.minimumTopUp>0&&<div className="customer-charge-row"><small>Miinimumtasu täitmine ({euros(p.minimum)})</small><strong>+{euros(price.minimumTopUp)}</strong></div>}
    {p.agreed_total!==null&&<p className="customer-agreement">Kokkulepitud lõpphind {euros(p.agreed_total)}{price?.calculated!=null?` · tundide järgi ${euros(price.calculated)}`:''}</p>}
    <details><summary>Muuda selle objekti hindu ja arvestust</summary><div className="stack top-gap">
      <div className="form-grid two"><MoneyInput label="Tõstuk, €/h" value={p.lift_rate} onChange={v=>change({lift_rate:v as number})}/><MoneyInput label="Juhi eraldi tasu, €/h" value={p.driver_rate} onChange={v=>change({driver_rate:v as number})}/><MoneyInput label="Juht teeb töö, lisatasu €/h" value={p.operator_rate} onChange={v=>change({operator_rate:v as number})}/><MoneyInput label="Abiline, €/h inimese kohta" value={p.helper_rate} onChange={v=>change({helper_rate:v as number})}/><MoneyInput label="Miinimumtasu, €" value={p.minimum} onChange={v=>change({minimum:v as number})}/><MinutesInput label="Arvestatav aeg, min" value={p.billed_minutes} optional onChange={v=>change({billed_minutes:v})}/></div>
      <small className="muted">Juhi eraldi tasu 0 € tähendab, et juht on tõstuki hinnas. Tühi arvestatav aeg kasutab objekti algust ja lõppu.</small>
      <div className="form-grid two"><MinutesInput label="Juhi tehtava töö aeg, min" optional value={p.operator_minutes} onChange={v=>change({operator_minutes:v})}/><MinutesInput label="Iga abilise tööaeg, min" optional value={p.helper_minutes} onChange={v=>change({helper_minutes:v})}/></div>
      <MoneyInput label="Kokkulepitud lõpphind, € (tühi = arvutus)" optional value={p.agreed_total} onChange={v=>change({agreed_total:v})}/>
      {p.agreed_total!==null&&<button className="text-button" type="button" onClick={()=>change({agreed_total:null})}>Arvuta hind tundide järgi</button>}
      <small className="muted">Siinsed hinnad kehtivad ainult sellele objektile. <Link href="/manager/settings" target="_blank">Ava üldhinnad</Link></small>
    </div></details>
    <details><summary>Sõit ja hinnakorrektsioon</summary><div className="form-grid two top-gap"><MinutesInput label="Sõiduaeg, min" value={p.drive_minutes} onChange={v=>change({drive_minutes:v as number})}/><MoneyInput label="Sõit, €/h" value={p.drive_rate} onChange={v=>change({drive_rate:v as number})}/><MoneyInput label="Kilomeetrihind, €/km" value={p.km_rate} onChange={v=>change({km_rate:v as number})}/><MoneyInput signed label="Lisatasu / soodustus, €" value={p.adjustment} onChange={v=>change({adjustment:v as number})}/></div></details>
    {error&&<p className="error-text" role="alert">{error}</p>}
  </section>
}
