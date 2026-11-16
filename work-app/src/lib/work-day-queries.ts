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
