import { createClient } from '@/lib/supabase/server'
import { DeliverySheetForm } from './DeliverySheetForm'
import type { SheetJob, SavedSheet } from '@/lib/delivery-sheet'

export async function JobDeliverySheet({job}:{job:SheetJob&{status?:string}}) {
  const supabase=await createClient()
  const {data,error}=await supabase.from('job_delivery_sheets').select('*').eq('job_id',job.id).maybeSingle()
  if(error) return <section className="detail-card"><h2>Saateleht</h2><p>Saatelehe laadimine ebaõnnestus. Palun värskenda lehte.</p></section>
  if(job.status==='tuhistatud'&&!data) return null
  return <DeliverySheetForm job={job} initial={data as SavedSheet|null}/>
}
