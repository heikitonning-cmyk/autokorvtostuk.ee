'use client'

import Link from 'next/link'
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from 'react'
import { addPayrollSite, deleteTimeEntry, saveEmployee, saveTimeEntry } from '@/app/manager/time/actions'
import { calculateTime, clock, euros, groupedTotals, hours, totals, wageCents, type ActionState, type Employee, type PayrollSite, type TimeEntry } from '@/lib/payroll'

type Customer = { id: string; name: string }
type Props = { month: string; today: string; employees: Employee[]; sites: PayrollSite[]; customers: Customer[]; entries: TimeEntry[]; saved: boolean; showSummary?: boolean }
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

function TimeForm({ employees, sites, customers, date, entry, onCancel }: Pick<Props,'employees'|'sites'|'customers'> & { date:string; entry?:TimeEntry; onCancel:()=>void }) {
  const [state, action, pending] = useActionState(saveTimeEntry, initial)
  const [employeeId, setEmployeeId] = useState(entry?.employee_id ?? employees.find(e => e.active)?.id ?? '')
  const [siteId, setSiteId] = useState(entry?.site_id ?? '')
  const [workDate, setWorkDate] = useState(entry?.work_date ?? date)
  const [start, setStart] = useState(entry ? clock(entry.start_minute) : '08:00')
  const [end, setEnd] = useState(entry ? clock(entry.end_minute) : '17:00')
  const [lunch, setLunch] = useState(entry ? String(entry.break_minutes) : '')
  const [nextDay, setNextDay] = useState(entry?.next_day ?? false)
  const [note, setNote] = useState(entry?.note ?? '')
  const employee = employees.find(e => e.id === employeeId)
  const rate = entry?.employee_id === employeeId ? entry.hourly_rate_cents : employee?.hourly_rate_cents
  let preview = '', invalid = ''
  try {
    const time = calculateTime(start, end, lunch, nextDay)
    if (rate) preview = `${hours(time.paidMinutes)} × ${euros(rate)}/h = ${euros(wageCents(time.paidMinutes, rate))}`
  } catch(e) { invalid = (e as Error).message }
  const choices = sites.filter(s => s.active || s.id === entry?.site_id)
  return <form action={action} onSubmit={e=>submitDraft(e,action)} className="form-card stack">
    <h2>{entry ? 'Muuda tööaega' : 'Lisa tööaeg'}</h2>
    <input type="hidden" name="id" value={entry?.id ?? ''} /><input type="hidden" name="version" value={entry?.updated_at ?? ''} />
    <fieldset disabled={pending} className="payroll-fields stack">
      <div className="form-grid two">
        <label>Tööline<select name="employeeId" required value={employeeId} onChange={e=>setEmployeeId(e.target.value)}><option value="">Vali tööline</option>{employees.filter(e=>e.active || e.id===entry?.employee_id).map(e=><option key={e.id} value={e.id}>{e.name}{!e.active ? ' (arhiveeritud)' : ''}</option>)}</select></label>
        <label>Objekt<select name="siteId" required value={siteId} onChange={e=>setSiteId(e.target.value)}><option value="">Vali objekt</option>{choices.map(s=><option key={s.id} value={s.id}>{s.name} · {customers.find(c=>c.id===s.customer_id)?.name ?? ''}{!s.active ? ' (arhiveeritud)' : ''}</option>)}</select></label>
      </div>
      <div className="form-grid three">
        <label>Kuupäev<input type="date" name="date" min="2000-01-01" max="2099-12-31" required value={workDate} onChange={e=>setWorkDate(e.target.value)} /></label>
        <label>Algus<input type="time" name="start" required value={start} onChange={e=>setStart(e.target.value)} /></label>
        <label>Lõpp<input type="time" name="end" required value={end} onChange={e=>setEnd(e.target.value)} /></label>
      </div>
      <div className="form-grid two"><label>Lõunapaus, min<input name="lunch" type="number" min="0" max="1439" step="1" placeholder="0" value={lunch} onChange={e=>setLunch(e.target.value)} /><small className="muted">Tasustamata paus. Võib jääda tühjaks.</small></label><label className="check-row"><input type="checkbox" name="nextDay" checked={nextDay} onChange={e=>setNextDay(e.target.checked)} /> Lõpp järgmisel päeval</label></div>
      <label><span>Märkus <span className="muted">(soovi korral)</span></span><input name="note" maxLength={1000} value={note} onChange={e=>setNote(e.target.value)} /></label>
      <div className="payroll-preview" aria-live="polite">{invalid || preview || 'Vali tööline, et näha palgasummat.'}</div>
      {entry && <small className="muted">Sama töölise puhul säilib selle kirje algne tunnihind.</small>}
      <div className="payroll-buttons"><button className="button primary" disabled={pending || !!invalid || !employeeId || !siteId}>{pending ? 'Salvestan…' : entry ? 'Salvesta muudatus' : 'Salvesta tööaeg'}</button>{entry && <button className="button secondary" type="button" onClick={onCancel}>Loobu</button>}</div>
    </fieldset><Feedback state={state} />
  </form>
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

function DeleteEntry({entry}: {entry:TimeEntry}) {
  const [state,action,pending] = useActionState(deleteTimeEntry,initial)
  return <form action={action} onSubmit={e=>{ if(!window.confirm('Kustuta see tööajakirje? See eemaldab ka selle palgasumma.')) e.preventDefault() }}>
    <input type="hidden" name="id" value={entry.id}/><input type="hidden" name="version" value={entry.updated_at}/>
    <button className="button secondary" disabled={pending}>{pending ? 'Kustutan…' : 'Kustuta'}</button><Feedback state={state}/>
  </form>
}

export function PayrollWorkspace({month,today,employees,sites,customers,entries,saved,showSummary}: Props) {
  const [tab,setTab] = useState<'entry'|'summary'|'employees'|'sites'>(showSummary ? 'summary' : 'entry')
  const [edit,setEdit] = useState<TimeEntry>()
  const [employeeFilter,setEmployeeFilter] = useState(''), [siteFilter,setSiteFilter] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const visible = entries.filter(e=>(!employeeFilter || e.employee_id===employeeFilter) && (!siteFilter || e.site_id===siteFilter))
  const total = totals(visible)
  const employeeName = (id:string) => employees.find(e=>e.id===id)?.name ?? 'Tööline'
  const siteName = (id:string) => {const site=sites.find(s=>s.id===id); return site ? `${site.name} · ${customers.find(c=>c.id===site.customer_id)?.name ?? ''}` : 'Objekt'}
  return <div className="page stack-lg payroll-page">
    <div><p className="eyebrow">Tööaja arvestus</p><h1 ref={heading} tabIndex={-1}>Tunnid ja palgad</h1><p className="muted">Töötunnid × töölise tunnihind. Lõunapaus läheb maha.</p></div>
    <div className="segmented payroll-tabs" aria-label="Tööaja vaated">{([['entry','Sisesta'],['summary','Kokkuvõte'],['employees','Töölised'],['sites','Objektid']] as const).map(([id,label])=><button key={id} type="button" className={tab===id?'active':''} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</div>
    <section hidden={tab!=='entry'} className="stack">
      {!employees.some(e=>e.active) && !edit ? <div className="form-card stack"><h2>Lisa esimene tööline</h2><p>Vaja on ainult nime ja tunnihinda. Töölisele ei ole vaja kasutajakontot.</p><EmployeeForm/></div> : <TimeForm key={edit?.id ?? 'new'} employees={employees} sites={sites} customers={customers} date={month===today.slice(0,7)?today:`${month}-01`} entry={edit} onCancel={()=>setEdit(undefined)}/>}
      {!sites.some(s=>s.active) && <div className="form-card stack"><h2>Lisa esimene objekt</h2><SiteForm customers={customers}/></div>}
      <div className="payroll-buttons"><button type="button" className="button secondary" onClick={()=>setTab('employees')}>+ Tööline</button><button type="button" className="button secondary" onClick={()=>setTab('sites')}>+ Objekt</button></div>
    </section>
    {tab==='summary' && <>
      {saved && <div className="alert success" role="status">Tööaeg salvestatud.</div>}
      <section className="form-card stack">
        <form method="get" action="/manager/time" className="payroll-month"><label>Kuu<input type="month" name="month" required min="2000-01" max="2099-12" defaultValue={month}/></label><input type="hidden" name="view" value="summary"/><button className="button secondary">Näita</button></form>
        <div className="form-grid two"><label>Tööline<select value={employeeFilter} onChange={e=>setEmployeeFilter(e.target.value)}><option value="">Kõik töölised</option>{employees.map(e=><option value={e.id} key={e.id}>{e.name}{e.active?'':' (arhiveeritud)'}</option>)}</select></label><label>Objekt<select value={siteFilter} onChange={e=>setSiteFilter(e.target.value)}><option value="">Kõik objektid</option>{sites.map(s=><option value={s.id} key={s.id}>{siteName(s.id)}</option>)}</select></label></div>
      </section>
      <div className="metrics-grid"><div className="metric-card"><span>Töötunde kokku</span><strong>{hours(total.minutes)}</strong></div><div className="metric-card"><span>Palk kokku</span><strong>{euros(total.cents)}</strong><small>Makse ei arvestata</small></div><div className="metric-card"><span>Kirjeid</span><strong>{visible.length}</strong></div></div>
      <p className="muted">Öötöö arvestatakse alguskuupäeva kuusse. Summad liidetakse kirjete kaupa sendi täpsusega.</p>
      <div className="form-grid two">{([['employee_id','Tööliste palgad'],['site_id','Objektide tööjõukulu']] as const).map(([key,title])=><section className="detail-card" key={key}><h2>{title}</h2>{groupedTotals(visible,key).map(g=><div className="payroll-total-row" key={g.id}><strong>{key==='employee_id'?employeeName(g.id):siteName(g.id)}</strong><span>{hours(g.minutes)}</span><b>{euros(g.cents)}</b></div>)}{!visible.length && <p className="muted">Valitud kuus ja filtritega kirjeid pole.</p>}</section>)}</div>
      <section className="stack"><h2>Tööajakirjed</h2>{visible.map(e=><article className="detail-card stack" key={e.id}>
        <div className="payroll-entry-heading"><div><strong>{employeeName(e.employee_id)}</strong><p className="muted">{siteName(e.site_id)}</p></div><strong>{euros(e.wage_cents)}</strong></div>
        <p>{e.work_date.split('-').reverse().join('.')} · {clock(e.start_minute)}–{clock(e.end_minute)}{e.next_day?' (+1 päev)':''} · paus {e.break_minutes} min</p>
        <p>{hours(e.paid_minutes)} × {euros(e.hourly_rate_cents)}/h{e.note ? ` · ${e.note}` : ''}</p>
        <div className="payroll-buttons"><button className="button secondary" type="button" onClick={()=>{setEdit(e);setTab('entry');heading.current?.focus();window.scrollTo({top:0,behavior:'smooth'})}}>Muuda</button><DeleteEntry entry={e}/></div>
      </article>)}{!visible.length && <div className="empty">Tööaegu veel ei ole. Alusta vaates „Sisesta”.</div>}</section>
    </>}
    {tab==='employees' && <>
      <section className="form-card stack"><h2>Lisa tööline</h2><EmployeeForm/></section>
      <p className="muted">Tunnihinna muudatus kehtib uutele kirjetele. Arhiveerimiseks eemalda linnuke „Aktiivne tööline”; varasem arvestus säilib.</p>
      {employees.map(e=><details className="detail-card" key={e.id}><summary>{e.name} · {euros(e.hourly_rate_cents)}/h{e.active?'':' · arhiveeritud'}</summary><div className="top-gap"><EmployeeForm employee={e}/></div></details>)}
    </>}
    {tab==='sites' && <><section className="form-card stack"><h2>Lisa objekt</h2><p className="muted">Siin on samad objektid, mida kasutad tööde juures.</p><SiteForm customers={customers}/></section><section className="detail-card stack"><h2>Olemasolevad objektid</h2>{sites.map(s=><p key={s.id}>{siteName(s.id)}{s.active?'':' · arhiveeritud'}</p>)}</section></>}
  </div>
}
