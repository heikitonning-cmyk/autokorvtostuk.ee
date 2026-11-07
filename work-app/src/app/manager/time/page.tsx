import Link from 'next/link'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { readAllPages } from '@/lib/pagination'
import { monthRange, tallinnDate, type Employee, type PayrollSite, type TimeEntry } from '@/lib/payroll'
import { PayrollWorkspace } from '@/components/PayrollWorkspace'

export default async function TimePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser('manager')
  const params = await searchParams
  const today = tallinnDate()
  let month = typeof params.month === 'string' ? params.month : today.slice(0, 7)
  try { monthRange(month) } catch { month = today.slice(0, 7) }
  const { from, to } = monthRange(month)
  const db = await createClient()
  let data
  try {
    data = await Promise.all([
      readAllPages<Employee>((a,b) => db.from('payroll_employees').select('id,name,hourly_rate_cents,active,updated_at').order('name').order('id').range(a,b)),
      readAllPages<PayrollSite>((a,b) => db.from('customer_sites').select('id,name,customer_id,active').order('name').order('id').range(a,b)),
      readAllPages<{id:string;name:string}>((a,b) => db.from('customers').select('id,name').order('name').order('id').range(a,b)),
      readAllPages<TimeEntry>((a,b) => db.from('payroll_entries').select('*').gte('work_date',from).lt('work_date',to).order('work_date',{ascending:false}).order('start_minute',{ascending:false}).order('id').range(a,b)),
    ])
  } catch {
    return <div className="page stack-lg"><h1>Tunnid ja palgad</h1><div className="alert danger" role="alert">Andmeid ei õnnestunud laadida. Proovi leht uuesti avada. Kui viga kordub, vajab mooduli ühendus kontrollimist.</div><Link className="button secondary" href="/manager/time">Proovi uuesti</Link></div>
  }
  const saved = typeof params.saved === 'string'
  return <PayrollWorkspace key={`${month}-${params.saved ?? ''}-${params.view ?? ''}`} month={month} today={today} employees={data[0]} sites={data[1]} customers={data[2]} entries={data[3]} saved={saved} showSummary={saved || params.view === 'summary'} />
}
