import { createClient } from '@/lib/supabase/server'
import { readAllPages } from '@/lib/pagination'
import type { SheetJob } from '@/lib/delivery-sheet'
export async function getJobSeries(job:SheetJob&{continuation_root_id?:string|null}) {
  const db=await createClient(),rootId=job.continuation_root_id||job.id
  const jobs=await readAllPages<SheetJob>((a,b)=>db.from('jobs').select('*,customer:customers(name,phone,email,billing_address),vehicle:vehicles(registration_number)')
    .or(`id.eq.${rootId},continuation_root_id.eq.${rootId}`).neq('status','tuhistatud').order('planned_date').order('planned_time').order('id').range(a,b))
  return {rootId,jobs}
}
