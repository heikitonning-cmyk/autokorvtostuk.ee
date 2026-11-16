'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { validDate, type ActionState } from '@/lib/payroll'

export async function saveWorkDay(_previous:ActionState,form:FormData):Promise<ActionState> {
  await requireUser('manager')
  const date=String(form.get('date')??'')
  if(!validDate(date)) return {error:'Vali korrektne kuupäev.'}
  try {
    const payload=JSON.parse(String(form.get('payload')??''))
    const db=await createClient()
    const {error}=await db.rpc('save_work_day',{p_request_id:payload.requestId,p_date:date,p_expected:payload.expected,p_day:payload.day,p_jobs:payload.jobs,p_workers:payload.workers})
    if(error) {
      if(error.code==='23P01') return {error:'Ühel töölisel kattub päev mõne teise tööajaga, näiteks üle südaöö. Ühtegi muudatust ei salvestatud.'}
      if(error.code==='P0001'||(error.code==='23514'&&!error.message.includes('constraint'))) return {error:error.message}
      return {error:'Kontrolli päeva algust, lõppu, pause, tööliste andmeid ja objektide kellaaegu. Ühtegi muudatust ei salvestatud.'}
    }
  } catch {return {error:'Salvestamine ei õnnestunud. Sinu sisestus on alles; proovi uuesti.'}}
  revalidatePath('/manager','layout')
  revalidatePath('/operator','layout')
  redirect(`/manager/time/days/${date}?saved=1`)
}
