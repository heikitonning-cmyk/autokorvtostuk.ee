import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { readAllPages } from '@/lib/pagination'
import { LegacyTimeEditor } from '@/components/LegacyTimeEditor'
import type { Employee, PayrollSite } from '@/lib/payroll'
export default async function EntryPage({params}:{params:Promise<{id:string}>}) {
  await requireUser('manager')
  const {id}=await params,db=await createClient()
  const {data:entry,error}=await db.from('payroll_entries').select('*,sites:payroll_entry_sites(site_id),job:jobs!payroll_entries_job_id_fkey(address)').eq('id',id).maybeSingle()
  if(error) throw error
  if(!entry) notFound()
  if(entry.work_day_id) redirect(`/manager/time/days/${entry.work_date}`)
  const [employees,sites,customers]=await Promise.all([
    readAllPages<Employee>((a,b)=>db.from('payroll_employees').select('*').order('id').range(a,b)),
    readAllPages<PayrollSite>((a,b)=>db.from('customer_sites').select('id,name,customer_id,active').order('id').range(a,b)),
    readAllPages<{id:string;name:string}>((a,b)=>db.from('customers').select('id,name').order('id').range(a,b)),
  ])
  return <div className="page day-page stack-lg"><Link href={`/manager/time/workers/${entry.employee_id}`} className="back-link">← Töölise juurde</Link><h1>Muuda varasemat tööaega</h1><LegacyTimeEditor entry={entry} employees={employees} sites={sites} customers={customers} now={new Date().toISOString()}/></div>
}
