import { createClient } from '@/lib/supabase/server'
import { readAllPages } from '@/lib/pagination'
import type { DayData, DayEntry } from '@/lib/work-days'

export async function getWorkDay(date:string):Promise<DayData> {
  const db=await createClient()
  const [day,jobs,entries]=await Promise.all([
    db.from('work_days').select('*').eq('work_date',date).maybeSingle(),
    readAllPages<any>((a,b)=>db.from('jobs').select('id,address,planned_date,planned_time,planned_end_time,contact_phone,description,driver_employee_id,site_id,updated_at,work_day_id,customer_pricing,price_snapshot_json,estimated_total,estimated_hours,estimated_drive_hours,estimated_km,estimated_helper_hours,manual_adjustment,operator_does_work,operator_work_hourly_rate,website_booking_details,customer:customers(phone)').eq('planned_date',date).neq('status','tuhistatud').order('planned_time').order('id').range(a,b)),
    readAllPages<DayEntry>((a,b)=>db.from('payroll_entries').select('*').eq('work_date',date).order('start_minute').order('id').range(a,b)),
  ])
  if(day.error) throw day.error
  return {date,day:day.data,jobs:jobs.map(j=>({...j,contact_phone:j.contact_phone??j.website_booking_details?.phone??j.customer?.phone??null})),entries}
}

export async function getDailyPayrollCosts(dates:string[]) {
  const costs:Record<string,{cents:number;entries:number;running:number}>={}
  if(!dates.length) return costs
  const sorted=[...dates].sort(),db=await createClient()
  const entries=await readAllPages<{work_date:string;wage_cents:number|null;end_minute:number|null}>((a,b)=>
    db.from('payroll_entries').select('work_date,wage_cents,end_minute').gte('work_date',sorted[0]).lte('work_date',sorted[sorted.length-1]).order('work_date').order('id').range(a,b))
  for(const entry of entries) {
    const day=costs[entry.work_date]??={cents:0,entries:0,running:0}
    day.entries++
    if(entry.end_minute===null) day.running++
    else day.cents+=Number(entry.wage_cents??0)
  }
  return costs
}
