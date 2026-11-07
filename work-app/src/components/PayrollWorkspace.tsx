'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PaymentBalances, PayrollPayments } from '@/components/PayrollPayments'
import type { PayrollBalance, PayrollPayment } from '@/lib/payroll-payments'
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from 'react'
import { addPayrollSite, deleteTimeEntry, finishTimeEntries, saveEmployee, saveTimeEntry } from '@/app/manager/time/actions'
import { calculateTime, clock, entrySiteIds, euros, groupedTotals, hours, runningMinutes, tallinnClock, tallinnDate, totals, wageCents, type ActionState, type Employee, type PayrollSite, type TimeEntry } from '@/lib/payroll'

type Customer = { id: string; name: string }
type Props = { month: string; today: string; employees: Employee[]; sites: PayrollSite[]; customers: Customer[]; entries: TimeEntry[]; running: TimeEntry[]; now: string; saved: boolean; showSummary?: boolean; payments:PayrollPayment[]; balances:PayrollBalance[]; paymentRequestId:string; showPayments:boolean; paymentSaved:boolean }
const initial: ActionState = {}

// Dispatch explicitly so a rejected action cannot reset native select fields.
function submitDraft(event: FormEvent<HTMLFormElement>, action: (data: FormData) => void) {
  event.preventDefault()
  const data = new FormData(event.currentTarget)
  startTransition(() => action(data))
}

function Feedback({ state }: { state: ActionState }) {
  return <>{state.error && <div className="alert danger" role="alert">{state.error}</div>}{state.success && <div className="alert success" role="status">{state.success}</div>}</>
}

function SiteChoices({sites, customers, selected, onChange}: Pick<Props,'sites'|'customers'> & {selected:string[]; onChange:(ids:string[])=>void}) {
  return <details className="payroll-site-picker" open={selected.length > 0 || undefined}>
    <summary>Objektid <span className="muted">{selected.length ? `(${selected.length} valitud)` : '(soovi korral)'}</span></summary>
    <p className="muted">Võid valida mitu. Objektid on lisainfo ega muuda tunde või palka.</p>
    <div className="payroll-choices top-gap">{sites.filter(s=>s.active || selected.includes(s.id)).map(s=><label className="payroll-choice" key={s.id}>
      <input type="checkbox" name="siteId" value={s.id} checked={selected.includes(s.id)} onChange={e=>onChange(e.target.checked?[...selected,s.id]:selected.filter(id=>id!==s.id))}/>
      <span>{s.name}<small>{customers.find(c=>c.id===s.customer_id)?.name}{s.active?'':' · arhiveeritud'}</small></span>
    </label>)}{!sites.length && <p className="muted">Objekte pole veel lisatud. Tööaja saab salvestada ka ilma objektita.</p>}</div>
  </details>
}

function TimeForm({ employees, sites, customers, running, date, now, entry, onCancel }: Pick<Props,'employees'|'sites'|'customers'|'running'|'now'> & { date:string; entry?:TimeEntry; onCancel:()=>void }) {
  const [state, action, pending] = useActionState(saveTimeEntry, initial)
  const [employeeIds, setEmployeeIds] = useState<string[]>(entry ? [entry.employee_id] : [])
  const [siteIds, setSiteIds] = useState(entry ? entrySiteIds(entry) : [])
  const [mode, setMode] = useState<'manual'|'start'>('manual')
  const [workDate, setWorkDate] = useState(entry?.work_date ?? date)
  const [start, setStart] = useState(entry ? clock(entry.start_minute) : '08:00')
  const [end, setEnd] = useState(entry ? (entry.end_minute === null ? tallinnClock(new Date(now)) : clock(entry.end_minute)) : '17:00')
  const [lunch, setLunch] = useState(entry ? String(entry.break_minutes) : '')
  const [nextDay, setNextDay] = useState(entry?.end_minute === null ? tallinnDate(new Date(now)) > entry.work_date : entry?.next_day ?? false)
  const [note, setNote] = useState(entry?.note ?? '')
  useEffect(()=>{if(mode==='start') setEmployeeIds(ids=>ids.filter(id=>!running.some(r=>r.employee_id===id)))},[mode,running])
  const available = employees.filter(e=>e.active || e.id===entry?.employee_id)
  const isRunning = (id:string) => running.some(e=>e.employee_id===id)
  const eligible = available.filter(e=>mode==='manual' || !isRunning(e.id))
  const selected = available.filter(e=>employeeIds.includes(e.id))
  const rate = (e:Employee) => entry?.employee_id===e.id ? entry.hourly_rate_cents : e.hourly_rate_cents
  let paid = 0, invalid = ''
  if(mode==='manual') try { paid=calculateTime(start,end,lunch,nextDay).paidMinutes } catch(e) { invalid=(e as Error).message }
  useEffect(()=>{ if(state.savedId) {setEmployeeIds([]);setSiteIds([]);setNote('')} },[state])
  return <form action={action} onSubmit={e=>submitDraft(e,action)} className="form-card stack">
    <h2>{entry ? (entry.end_minute===null ? 'Paranda ja lõpeta tööaeg' : 'Muuda tööaega') : 'Tööliste tööaeg'}</h2>
    <input type="hidden" name="id" value={entry?.id ?? ''} /><input type="hidden" name="version" value={entry?.updated_at ?? ''} />
    <input type="hidden" name="mode" value={mode}/>
    <fieldset disabled={pending} className="payroll-fields stack">
      {!entry && <div className="segmented payroll-tabs" aria-label="Tööaja sisestamise viis">
        <button type="button" className={mode==='manual'?'active':''} aria-pressed={mode==='manual'} onClick={()=>setMode('manual')}>Sisesta algus ja lõpp</button>
        <button type="button" className={mode==='start'?'active':''} aria-pressed={mode==='start'} onClick={()=>{setMode('start');setEmployeeIds(ids=>ids.filter(id=>!isRunning(id)))}}>Alusta kohe</button>
      </div>}
      <div className="stack"><div className="payroll-selection-heading"><strong>{entry?'Tööline':`Töölised${selected.length ? ` · ${selected.length} valitud` : ''}`}</strong>{!entry && <button type="button" className="text-button" onClick={()=>setEmployeeIds(employeeIds.length===eligible.length?[]:eligible.map(e=>e.id))}>{employeeIds.length===eligible.length && eligible.length ? 'Tühjenda valik' : 'Vali kõik'}</button>}</div>
        {entry ? <select aria-label="Tööline" name="employeeId" value={employeeIds[0]??''} onChange={e=>setEmployeeIds([e.target.value])}>{available.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select> : <div className="payroll-choices">{available.map(e=><label className={`payroll-choice ${employeeIds.includes(e.id)?'selected':''}`} key={e.id}>
          <input type="checkbox" name="employeeId" value={e.id} checked={employeeIds.includes(e.id)} disabled={mode==='start' && isRunning(e.id)} onChange={ev=>setEmployeeIds(ev.target.checked?[...employeeIds,e.id]:employeeIds.filter(id=>id!==e.id))}/>
          <span>{e.name}<small>{euros(e.hourly_rate_cents)}/h{isRunning(e.id)?' · praegu tööl':''}</small></span>
        </label>)}</div>}
      </div>
      {mode==='manual' ? <>
        <div className="form-grid three">
          <label>Kuupäev<input type="date" name="date" min="2000-01-01" max="2099-12-31" required value={workDate} onChange={e=>setWorkDate(e.target.value)}/></label>
          <label>Algus<input type="time" name="start" required value={start} onChange={e=>setStart(e.target.value)}/></label>
          <label>Lõpp<input type="time" name="end" required value={end} onChange={e=>setEnd(e.target.value)}/></label>
        </div>
        <div className="form-grid two"><label>Lõunapaus, min<input name="lunch" type="number" min="0" max="1439" step="1" placeholder="0" value={lunch} onChange={e=>setLunch(e.target.value)}/><small className="muted">Iga valitud töölise tasustamata paus. Võib jääda tühjaks.</small></label><label className="check-row"><input type="checkbox" name="nextDay" checked={nextDay} onChange={e=>setNextDay(e.target.checked)}/> Lõpp järgmisel päeval</label></div>
      </> : <p className="muted">Algusaeg salvestatakse nupuvajutusel automaatselt Eesti aja järgi. Äpi võib seejärel sulgeda. Lõpetamisel saad lisada lõunapausi.</p>}
      <SiteChoices sites={sites} customers={customers} selected={siteIds} onChange={setSiteIds}/>
      <label>Märkus (soovi korral)<input name="note" maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></label>
      {mode==='manual' && <div className="payroll-preview" aria-live="polite">{invalid || (selected.length ? <><div>{hours(paid)} igale töölisele · kokku {euros(selected.reduce((sum,e)=>sum+wageCents(paid,rate(e)),0))}</div>{selected.map(e=><small className="payroll-preview-line" key={e.id}>{e.name}: {hours(paid)} × {euros(rate(e))}/h = {euros(wageCents(paid,rate(e)))}</small>)}</> : 'Vali üks või mitu töölist.')}</div>}
      {entry && <small className="muted">Sama töölise puhul säilib selle kirje algne tunnihind.</small>}
      <div className="payroll-buttons"><button className={`button ${mode==='start'?'finish':'primary'}`} disabled={pending || !!invalid || !selected.length}>{pending ? 'Salvestan…' : mode==='start' ? `Alusta tööd${selected.length?` (${selected.length})`:''}` : entry ? 'Salvesta tööaeg' : `Salvesta tööaeg${selected.length?` (${selected.length})`:''}`}</button>{entry && <button className="button secondary" type="button" onClick={onCancel}>Loobu</button>}</div>
    </fieldset><Feedback state={state}/>
  </form>
}

function RunningWork({running, employees, sites, now, onEdit}: Pick<Props,'running'|'employees'|'sites'|'now'> & {onEdit:(entry:TimeEntry)=>void}) {
  const router = useRouter()
  const [state,action,pending] = useActionState(finishTimeEntries,initial)
  const [selected,setSelected] = useState<{id:string;updated_at:string}[]>([])
  const [lunch,setLunch] = useState('')
  const [current,setCurrent] = useState(()=>new Date(now))
  useEffect(()=>{const tick=setInterval(()=>setCurrent(new Date()),15000); return ()=>clearInterval(tick)},[])
  useEffect(()=>{
    const refresh=()=>{if(document.visibilityState==='visible') router.refresh()}
    const timer=setInterval(refresh,60000)
    window.addEventListener('focus',refresh)
    return ()=>{clearInterval(timer);window.removeEventListener('focus',refresh)}
  },[router])
  useEffect(()=>{if(state.savedId) {setSelected([]);setLunch('')}},[state])
  return <section className="form-card payroll-running stack">
    <div className="payroll-selection-heading"><h2>Praegu tööl <span className="status status-toob">{running.length}</span></h2><button className="text-button" type="button" onClick={()=>{setSelected([]);router.refresh()}}>Värskenda</button></div>
    {!running.length ? <p className="muted">Käimasolevaid tööaegu pole. Vali allpool „Alusta kohe”.</p> : <form action={action} onSubmit={e=>{
      e.preventDefault()
      const button=(e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
      const single=running.find(r=>r.id===button?.value)
      const data=new FormData(e.currentTarget)
      data.set('entries',JSON.stringify(single?[{id:single.id,updated_at:single.updated_at}]:selected))
      startTransition(()=>action(data))
    }} className="stack">
      <fieldset disabled={pending} className="payroll-fields stack">
        <button type="button" className="text-button" onClick={()=>setSelected(selected.length===running.length?[]:running.map(e=>({id:e.id,updated_at:e.updated_at})))}>{selected.length===running.length?'Tühjenda valik':'Vali kõik lõpetamiseks'}</button>
        {running.map(entry=>{const minutes=runningMinutes(entry,current);return <div className="payroll-running-row" key={entry.id}>
          <label className="payroll-choice"><input type="checkbox" aria-label={`Vali ${employees.find(e=>e.id===entry.employee_id)?.name??'tööline'} lõpetamiseks`} checked={selected.some(s=>s.id===entry.id)} onChange={e=>setSelected(e.target.checked?[...selected,{id:entry.id,updated_at:entry.updated_at}]:selected.filter(s=>s.id!==entry.id))}/>
            <span><strong>{employees.find(e=>e.id===entry.employee_id)?.name??'Tööline'}</strong><small>Algus {entry.work_date.split('-').reverse().join('.')} · {clock(entry.start_minute)} · {euros(entry.hourly_rate_cents)}/h</small><small>{entrySiteIds(entry).map(id=>sites.find(s=>s.id===id)?.name??'Objekt').join(' · ') || 'Objektita'}{entry.note ? ` · ${entry.note}`:''}</small></span>
          </label>
          <div className="payroll-running-actions"><strong>{hours(minutes)}</strong><button className="button finish" type="submit" name="singleId" value={entry.id} disabled={minutes<1 || minutes>1440}>Lõpeta</button><button type="button" className="text-button" onClick={()=>onEdit(entry)}>Muuda</button></div>
          {minutes>1440 && <p className="error-text">Töö on kestnud üle 24 tunni. Kontrolli ja paranda algus või lõpp nupuga „Muuda”.</p>}
        </div>})}
        <label>Lõunapaus, min<input type="number" name="lunch" min="0" max="1439" step="1" placeholder="0" value={lunch} onChange={e=>setLunch(e.target.value)}/><small className="muted">Lahutatakse iga praegu lõpetatava töölise ajast.</small></label>
        <button className="button finish" disabled={!selected.length || pending}>{pending?'Lõpetan…':`Lõpeta valitud (${selected.length})`}</button>
        <p className="muted">Lõppaeg lisatakse automaatselt. Käimasolev aeg jõuab palga kokkuvõttesse pärast lõpetamist.</p>
      </fieldset>
    </form>}
    <Feedback state={state}/>
  </section>
}

function EmployeeForm({ employee }: {employee?:Employee}) {
  const [state, action, pending] = useActionState(saveEmployee, initial)
  const [name,setName] = useState(employee?.name ?? '')
  const [rate,setRate] = useState(employee ? (employee.hourly_rate_cents / 100).toFixed(2) : '')
  const [active,setActive] = useState(employee?.active ?? true)
  const [version,setVersion] = useState(employee?.updated_at ?? '')
  useEffect(()=>{ if(state.savedId && !employee) {setName(''); setRate('')} if(state.savedVersion) setVersion(state.savedVersion) },[state,employee])
  return <form action={action} onSubmit={e=>submitDraft(e,action)} className="stack">
    <input type="hidden" name="id" value={employee?.id ?? ''} /><input type="hidden" name="version" value={version} />
    <fieldset disabled={pending} className="payroll-fields stack">
      <div className="form-grid two"><label>Töölise nimi<input name="name" required maxLength={120} value={name} onChange={e=>setName(e.target.value)} /></label><label>Tunnihind, €/h<input name="rate" required inputMode="decimal" placeholder="12,50" value={rate} onChange={e=>setRate(e.target.value)} /></label></div>
      {employee && <label className="check-row"><input name="active" type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)} /> Aktiivne tööline</label>}
      <button className="button secondary" disabled={pending}>{pending ? 'Salvestan…' : employee ? 'Salvesta tööline' : 'Lisa tööline'}</button>
    </fieldset><Feedback state={state}/>
  </form>
}

function SiteForm({customers}: {customers:Customer[]}) {
  const [state,action,pending] = useActionState(addPayrollSite,initial)
  const [customer,setCustomer] = useState(''), [name,setName] = useState(''), [address,setAddress] = useState('')
  useEffect(()=>{if(state.savedId) {setName('');setAddress('')}},[state])
  return <form action={action} onSubmit={e=>submitDraft(e,action)} className="stack">
    <fieldset disabled={pending} className="payroll-fields stack">
      <label>Klient<select name="customerId" required value={customer} onChange={e=>setCustomer(e.target.value)}><option value="">Vali klient</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="form-grid two"><label>Objekti nimi<input name="name" required maxLength={120} value={name} onChange={e=>setName(e.target.value)} /></label><label>Aadress (soovi korral)<input name="address" maxLength={300} value={address} onChange={e=>setAddress(e.target.value)} /></label></div>
      <button className="button secondary" disabled={pending}>{pending ? 'Salvestan…' : 'Lisa objekt'}</button>
    </fieldset><Feedback state={state}/><Link href="/manager/customers">Lisa uus klient või vaata olemasolevaid objekte</Link>
  </form>
}

function DeleteEntry({entry,onDeleted}: {entry:TimeEntry;onDeleted?:()=>void}) {
  const [state,action,pending] = useActionState(deleteTimeEntry,initial)
  useEffect(()=>{if(state.success) onDeleted?.()},[state,onDeleted])
  return <form action={action} onSubmit={e=>{ if(!window.confirm(entry.end_minute===null ? 'Tühista selle töölise alustatud töö? Tunde ega palka ei salvestata.' : 'Kustuta see tööajakirje? See eemaldab ka selle palgasumma.')) e.preventDefault() }}>
    <input type="hidden" name="id" value={entry.id}/><input type="hidden" name="version" value={entry.updated_at}/>
    <button className="button secondary" disabled={pending}>{pending ? 'Kustutan…' : entry.end_minute===null ? 'Tühista alustatud töö' : 'Kustuta'}</button><Feedback state={state}/>
  </form>
}

export function PayrollWorkspace({month,today,employees,sites,customers,entries,running,now,saved,showSummary,payments,balances,paymentRequestId,showPayments,paymentSaved}: Props) {
  const [tab,setTab] = useState<'entry'|'summary'|'payments'|'employees'|'sites'>(showPayments ? 'payments' : showSummary ? 'summary' : 'entry')
  const [paymentEmployee,setPaymentEmployee]=useState('')
  const [edit,setEdit] = useState<TimeEntry>()
  const [employeeFilter,setEmployeeFilter] = useState(''), [siteFilter,setSiteFilter] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const visible = entries.filter(e=>(!employeeFilter || e.employee_id===employeeFilter) && (!siteFilter || (siteFilter==='none' ? !entrySiteIds(e).length : entrySiteIds(e).includes(siteFilter))))
  const total = totals(visible)
  const employeeName = (id:string) => employees.find(e=>e.id===id)?.name ?? 'Tööline'
  const siteName = (id:string) => {const site=sites.find(s=>s.id===id); return site ? `${site.name} · ${customers.find(c=>c.id===site.customer_id)?.name ?? ''}` : 'Objekt'}
  const openPayment = (id:string) => {setPaymentEmployee(id);setTab('payments');heading.current?.focus();window.scrollTo({top:0,behavior:'smooth'})}
  const editEntry = (entry:TimeEntry) => {setEdit(entry);setTab('entry');heading.current?.focus();window.scrollTo({top:0,behavior:'smooth'})}
  return <div className="page stack-lg payroll-page">
    <div><p className="eyebrow">Tööaja arvestus</p><h1 ref={heading} tabIndex={-1}>Tunnid ja palgad</h1><p className="muted">Üks või mitu töölist korraga. Algus, lõpp ja soovi korral lõuna ning objektid.</p></div>
    <div className="segmented payroll-tabs" aria-label="Tööaja vaated">{([['entry','Tööaeg'],['summary','Kokkuvõte'],['payments','Maksed'],['employees','Töölised'],['sites','Objektid']] as const).map(([id,label])=><button key={id} type="button" className={tab===id?'active':''} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</div>
    <section hidden={tab!=='entry'} className="stack">
      <RunningWork running={running} employees={employees} sites={sites} now={now} onEdit={editEntry}/>
      {!employees.some(e=>e.active) && !edit ? <div className="form-card stack"><h2>Lisa esimene tööline</h2><p>Vaja on ainult nime ja tunnihinda. Töölisele ei ole vaja kasutajakontot.</p><EmployeeForm/></div> : <TimeForm key={edit?.id ?? 'new'} employees={employees} sites={sites} customers={customers} running={running} now={now} date={month===today.slice(0,7)?today:`${month}-01`} entry={edit} onCancel={()=>setEdit(undefined)}/>}
      {edit?.end_minute===null && <DeleteEntry entry={edit} onDeleted={()=>setEdit(undefined)}/>}
      <div className="payroll-buttons"><button type="button" className="button secondary" onClick={()=>setTab('employees')}>+ Tööline</button><button type="button" className="button secondary" onClick={()=>setTab('sites')}>+ Objekt</button></div>
    </section>
    <section hidden={tab!=='payments'}><PayrollPayments key={paymentEmployee} employees={employees} balances={balances} payments={payments} today={today} month={month} requestId={paymentRequestId} initialEmployeeId={paymentEmployee} saved={paymentSaved}/></section>
    {tab==='summary' && <>
      {saved && <div className="alert success" role="status">Tööaeg salvestatud.</div>}
      <section className="form-card stack">
        <form method="get" action="/manager/time" className="payroll-month"><label>Kuu<input type="month" name="month" required min="2000-01" max="2099-12" defaultValue={month}/></label><input type="hidden" name="view" value="summary"/><button className="button secondary">Näita</button></form>
        <div className="form-grid two"><label>Tööline<select value={employeeFilter} onChange={e=>setEmployeeFilter(e.target.value)}><option value="">Kõik töölised</option>{employees.map(e=><option value={e.id} key={e.id}>{e.name}{e.active?'':' (arhiveeritud)'}</option>)}</select></label><label>Objekt<select value={siteFilter} onChange={e=>setSiteFilter(e.target.value)}><option value="">Kõik objektid</option><option value="none">Objektita</option>{sites.map(s=><option value={s.id} key={s.id}>{siteName(s.id)}</option>)}</select></label></div>
      </section>
      <div className="metrics-grid"><div className="metric-card"><span>Töötunde kokku</span><strong>{hours(total.minutes)}</strong></div><div className="metric-card"><span>Kuu teenitud tasu</span><strong>{euros(total.cents)}</strong><small>Makse ei arvestata</small></div><div className="metric-card"><span>Kirjeid</span><strong>{visible.length}</strong></div></div>
      <p className="muted">Öötöö arvestatakse alguskuupäeva kuusse. Summad liidetakse kirjete kaupa sendi täpsusega.</p>
      {siteFilter && <p className="muted">Objektifilter näitab seotud tööajakirjeid tervikuna. Tunde ja palka objektide vahel ei jagata.</p>}
      <PaymentBalances employees={employees.filter(e=>!employeeFilter||e.id===employeeFilter)} balances={balances} onPayment={openPayment}/>
      <section className="detail-card"><h2>Valitud kuu teenitud tasu</h2>{groupedTotals(visible,'employee_id').map(g=><div className="payroll-total-row" key={g.id}><strong>{employeeName(g.id)}</strong><span>{hours(g.minutes)}</span><b>{euros(g.cents)}</b></div>)}{!visible.length && <p className="muted">Valitud kuus ja filtritega kirjeid pole.</p>}</section>
      <section className="stack"><h2>Tööajakirjed</h2>{visible.map(e=><article className="detail-card stack" key={e.id}>
        <div className="payroll-entry-heading"><div><strong>{employeeName(e.employee_id)}</strong><p className="muted">{entrySiteIds(e).map(siteName).join(' · ') || 'Objektita'}</p></div><strong>{euros(e.wage_cents ?? 0)}</strong></div>
        <p>{e.work_date.split('-').reverse().join('.')} · {clock(e.start_minute)}–{clock(e.end_minute ?? 0)}{e.next_day?' (+1 päev)':''} · paus {e.break_minutes} min</p>
        <p>{hours(e.paid_minutes ?? 0)} × {euros(e.hourly_rate_cents)}/h{e.note ? ` · ${e.note}` : ''}</p>
        <div className="payroll-buttons"><button className="button secondary" type="button" onClick={()=>editEntry(e)}>Muuda</button><DeleteEntry entry={e}/></div>
      </article>)}{!visible.length && <div className="empty">Tööaegu veel ei ole. Alusta vaates „Tööaeg”.</div>}</section>
    </>}
    {tab==='employees' && <>
      <section className="form-card stack"><h2>Lisa tööline</h2><EmployeeForm/></section>
      <p className="muted">Tunnihinna muudatus kehtib uutele kirjetele. Arhiveerimiseks eemalda linnuke „Aktiivne tööline”; varasem arvestus säilib.</p>
      {employees.map(e=><details className="detail-card" key={e.id}><summary>{e.name} · {euros(e.hourly_rate_cents)}/h{e.active?'':' · arhiveeritud'}</summary><div className="top-gap"><EmployeeForm employee={e}/></div></details>)}
    </>}
    {tab==='sites' && <><section className="form-card stack"><h2>Lisa objekt</h2><p className="muted">Siin on samad objektid, mida kasutad tööde juures.</p><SiteForm customers={customers}/></section><section className="detail-card stack"><h2>Olemasolevad objektid</h2>{sites.map(s=><p key={s.id}>{siteName(s.id)}{s.active?'':' · arhiveeritud'}</p>)}</section></>}
  </div>
}
