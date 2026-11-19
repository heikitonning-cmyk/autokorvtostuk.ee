import { createClient } from '@/lib/supabase/server'
import { readAllPages } from '@/lib/pagination'
import type { TrackedInvoice,InvoiceWithJob } from '@/lib/invoices'
export async function getInvoices():Promise<InvoiceWithJob[]> {
  const db=await createClient()
  return await readAllPages<any>((a,b)=>db.from('job_invoices')
    .select('*,job:jobs(id,address,object_name,planned_date,estimated_total,website_booking_details,customer:customers(name))')
    .order('due_on',{ascending:true,nullsFirst:false}).order('job_id').range(a,b)) as InvoiceWithJob[]
}
export async function getInvoice(jobId:string):Promise<TrackedInvoice|null> {
  const db=await createClient()
  const {data,error}=await db.from('job_invoices').select('*').eq('job_id',jobId).maybeSingle()
  if(error) throw error
  return data as TrackedInvoice|null
}
export async function getInvoiceHistory(jobId:string) {
  const db=await createClient()
  return readAllPages<any>((a,b)=>db.from('job_invoice_history')
    .select('id,changed_at,changed_by,previous_data,new_data,actor:users!job_invoice_history_changed_by_fkey(name)')
    .eq('job_id',jobId).order('changed_at',{ascending:false}).order('id',{ascending:false}).range(a,b))
}
