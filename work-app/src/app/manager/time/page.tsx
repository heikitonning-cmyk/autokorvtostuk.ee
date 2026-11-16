import Link from 'next/link'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { readAllPages } from '@/lib/pagination'
import { clock, euros, totals, type Employee } from '@/lib/payroll'
import { dateLabel, type DayEntry, type DayJob, type WorkDay } from '@/lib/work-days'
import type { PayrollBalance } from '@/lib/payroll-payments'
import { HoursTabs } from '@/components/HoursTabs'
import { EmployeeForm } from '@/components/PayrollWorkspace'

export default async function TimePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  await requireUser('manager')
  const params=await searchParams, view=params.view==='days'?'days':'workers',db=await createClient()
  const [employees,balances]=await Promise.all([
    readAllPages<Employee>((a,b)=>db.from('payroll_employees').select('*').order('name').order('id').range(a,b)),
    readAllPages<PayrollBalance>((a,b)=>db.rpc('payroll_balances').order('employee_id').range(a,b)),
  ])
  const due=balances.reduce((s,b)=>s+Math.max(0,b.balance_cents),0)
  let dates:string[]=[],days:WorkDay[]=[],entries:DayEntry[]=[],jobs:DayJob[]=[]
  if(view==='days') {
    ;[days,entries,jobs]=await Promise.all([
      readAllPages<WorkDay>((a,b)=>db.from('work_days').select('*').order('work_date',{ascending:false}).range(a,b)),
      readAllPages<DayEntry>((a,b)=>db.from('payroll_entries').select('*').order('work_date',{ascending:false}).order('id').range(a,b)),
      readAllPages<DayJob>((a,b)=>db.from('jobs').select('id,address,planned_date,planned_time,planned_end_time,work_day_id,contact_phone,description,driver_employee_id,site_id,updated_at').neq('status','tuhistatud').not('planned_date','is',null).order('planned_date',{ascending:false}).order('id').range(a,b)),
    ])
    dates=[...new Set([...days.map(d=>d.work_date),...entries.map(e=>e.work_date),...jobs.map(j=>j.planned_date!)])].sort().reverse()
  }
  return <div className="page stack-lg"><div className="page-title-row"><div><p className="eyebrow">Palgaarvestus</p><h1>Tunnid ja palgad</h1></div><Link className="button primary" href="/manager/jobs/new">+ Lisa tööpäev</Link></div><HoursTabs view={view}/>
    {view==='workers'?<><div className="day-team-heading"><h2>Töölised</h2><strong>Saada kokku {euros(due)}</strong></div><div className="workers-grid">{employees.map(e=>{const b=balances.find(b=>b.employee_id===e.id);return <Link className="detail-card worker-card stack" href={`/manager/time/workers/${e.id}`} key={e.id}><div className="day-team-heading"><h2>{e.name}</h2><span aria-hidden="true">→</span></div><small className="muted">{euros(e.hourly_rate_cents)}/h{e.active?'':' · arhiveeritud'}</small><div className="payroll-balance-grid"><div><span>Teenitud</span><strong>{euros(b?.earned_cents??0)}</strong></div><div><span>Makstud</span><strong>{euros(b?.paid_cents??0)}</strong></div><div className="payroll-due"><span>{(b?.balance_cents??0)<0?'Ettemaks':'Saada'}</span><strong>{euros(Math.abs(b?.balance_cents??0))}</strong></div></div></Link>})}</div><details className="detail-card"><summary>+ Lisa tööline</summary><div className="top-gap"><EmployeeForm/></div></details></>:<><p className="muted">Ava päev, et muuta korraga meeskonna tööaega ja selle päeva objekte.</p><div className="stack">{dates.map(date=>{const day=days.find(d=>d.work_date===date),es=entries.filter(e=>e.work_date===date),js=jobs.filter(j=>j.planned_date===date),sum=totals(es);return <Link className="detail-card day-list-card" key={date} href={`/manager/time/days/${date}`}><div><h2>{dateLabel(date)}</h2><p>{day?`${clock(day.start_minute)}–${clock(day.end_minute)}${day.next_day?' (+1 päev)':''}`:'Ava päeva ajad'} · {new Set(es.map(e=>e.employee_id)).size} töölist · {js.length} objekti</p><small className="muted">{js.map(j=>j.address).filter(Boolean).join(' · ')||'Objekte pole lisatud'}</small></div><strong>{euros(sum.cents)} →</strong></Link>})}{!dates.length&&<div className="empty">Tööpäevi pole veel lisatud.</div>}</div></>}
  </div>
}
