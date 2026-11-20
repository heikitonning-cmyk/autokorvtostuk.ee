'use client'
import { useRouter } from 'next/navigation'
import { TimeForm } from '@/components/PayrollWorkspace'
import type { Employee, PayrollSite, TimeEntry } from '@/lib/payroll'
export function LegacyTimeEditor({entry,employees,sites,customers,now}:{entry:TimeEntry;employees:Employee[];sites:PayrollSite[];customers:{id:string;name:string}[];now:string}) {
  const router=useRouter()
  return <TimeForm entry={entry} employees={employees} sites={sites} customers={customers} running={entry.end_minute===null?[entry]:[]} now={now} date={entry.work_date} onCancel={()=>router.push(`/manager/time/workers/${entry.employee_id}`)} returnToEmployee/>
}
