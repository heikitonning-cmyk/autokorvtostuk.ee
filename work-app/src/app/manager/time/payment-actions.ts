'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { tallinnDate, validDate, type ActionState } from '@/lib/payroll'
import { parsePaymentAmount } from '@/lib/payroll-payments'

const value=(form:FormData,key:string)=>String(form.get(key)??'').trim()
const uuid=(id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
const conflict='Makse on vahepeal muutunud või tühistatud. Värskenda lehte ja kontrolli maksete ajalugu.'

export async function savePayrollPayment(_previous:ActionState,form:FormData):Promise<ActionState> {
  await requireUser('manager')
  const id=value(form,'id'),employee=value(form,'employeeId'),date=value(form,'date'),note=value(form,'note'),version=value(form,'version')
  if(!uuid(id)||!uuid(employee)) return {error:'Vali tööline.'}
  if(!validDate(date)||date>tallinnDate()) return {error:'Vali makse kuupäev tänase või varasema kuupäevaga.'}
  if(note.length>1000) return {error:'Märkus võib olla kuni 1000 tähemärki.'}
  if(version&&!Number.isFinite(Date.parse(version))) return {error:conflict}
  let amount:number
  try {amount=parsePaymentAmount(value(form,'amount'))} catch(e) {return {error:(e as Error).message}}
  try {
    const db=await createClient()
    const {error}=await db.rpc('save_payroll_payment',{p_id:id,p_employee_id:employee,p_paid_date:date,p_amount_cents:amount,p_note:note,p_expected_version:version||null})
    if(error) return {error:error.code==='P0001'?conflict:'Makse salvestamine ei õnnestunud. Kontrolli summat, kuupäeva ja töölist; sisestus on alles.'}
  } catch {return {error:'Ühendus katkes. Proovi uuesti; sama makse korduv saatmine topeltmakset ei lisa.'}}
  revalidatePath('/manager/time')
  redirect(`/manager/time?month=${date.slice(0,7)}&view=payments&paymentSaved=${Date.now()}`)
}

export async function voidPayrollPayment(_previous:ActionState,form:FormData):Promise<ActionState> {
  await requireUser('manager')
  const id=value(form,'id'),version=value(form,'version')
  if(!uuid(id)||!version||!Number.isFinite(Date.parse(version))) return {error:conflict}
  try {
    const db=await createClient()
    const {data,error}=await db.from('payroll_payments').update({voided_at:new Date().toISOString()}).eq('id',id).eq('updated_at',version).is('voided_at',null).select('id').maybeSingle()
    if(error||!data) return {error:conflict}
  } catch {return {error:'Ühendus katkes. Värskenda lehte ja kontrolli, kas makse tühistati.'}}
  revalidatePath('/manager/time')
  return {success:'Makse tühistatud. Töölise saadaolev summa on uuesti arvutatud.'}
}
