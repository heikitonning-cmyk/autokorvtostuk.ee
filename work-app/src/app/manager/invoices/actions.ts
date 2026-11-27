'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { validDate } from '@/lib/payroll'
import { parseInvoiceAmount,type InvoiceState,type TrackedInvoice } from '@/lib/invoices'
export type InvoiceActionState={error?:string;success?:string;invoice?:TrackedInvoice}
const uuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
function refresh(jobId:string) {
  revalidatePath('/manager','layout')
  revalidatePath('/operator','layout')
  revalidatePath('/manager/invoices')
  revalidatePath(`/manager/invoices/${jobId}`)
  revalidatePath(`/manager/jobs/${jobId}`)
}
export async function startInvoice(_previous:InvoiceActionState,form:FormData):Promise<InvoiceActionState> {
  await requireUser('manager')
  const jobId=String(form.get('jobId')??'')
  if(!uuid(jobId)) return {error:'Vigane töö.'}
  const db=await createClient()
  const {error}=form.get('complete')==='yes'
    ?await db.rpc('mark_job_completed',{p_job_id:jobId,p_completed_at:new Date().toISOString()})
    :await db.rpc('activate_job_invoice',{p_job_id:jobId})
  if(error) return {error:'Arve jälgimise avamine ei õnnestunud. Värskenda lehte ja proovi uuesti.'}
  refresh(jobId)
  redirect(`/manager/invoices/${jobId}`)
}
export async function saveInvoice(_previous:InvoiceActionState,form:FormData):Promise<InvoiceActionState> {
  await requireUser('manager')
  const jobId=String(form.get('jobId')??'')
  if(!uuid(jobId)) return {error:'Vigane töö.'}
  try {
    const status=String(form.get('status')) as InvoiceState,version=Number(form.get('version'))
    if(!['draft','unpaid','paid'].includes(status)||!Number.isInteger(version)||version<1) return {error:'Kontrolli arve andmeid.'}
    const date=(name:string)=>{const value=String(form.get(name)??'');if(value&&!validDate(value)) throw new Error('Kontrolli kuupäevi.');return value||null}
    const amountOverride=form.get('amountOverride')==='true'
    const amount=amountOverride?parseInvoiceAmount(String(form.get('amount')??'')):null
    const payerName=String(form.get('payerName')??'').trim()
    if(payerName.length>200) return {error:'Maksja nimi võib olla kuni 200 märki.'}
    const db=await createClient()
    const {data,error}=await db.rpc('save_job_invoice_with_payer',{p_job_id:jobId,p_version:version,p_status:status,
      p_payer_name:payerName,p_amount_cents:amount,p_amount_override:amountOverride,p_invoice_number:String(form.get('number')??''),
      p_issued_on:status==='draft'?null:date('issuedOn'),p_due_on:status==='draft'?null:date('dueOn'),p_paid_on:status==='paid'?date('paidOn'):null})
    if(error) return {error:error.code==='P0001'?error.message:'Kontrolli summat ja kuupäevi. Maksetähtaeg ja makse ei saa olla enne arve esitamist.'}
    refresh(jobId)
    return {success:'Arve andmed salvestatud.',invoice:data as TrackedInvoice}
  } catch(error) {return {error:error instanceof Error?error.message:'Salvestamine ebaõnnestus.'}}
}
