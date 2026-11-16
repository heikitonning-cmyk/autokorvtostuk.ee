'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import type { ActionState } from '@/lib/payroll'

export async function updatePricing(_previous:ActionState,formData:FormData):Promise<ActionState> {
  const user=await requireUser('manager')
  const value:Record<string,number>={}
  for(const key of ['hourlyRate','driverHourlyRate','minimumOrder','driveHourlyRate','kmRate','helperHourlyRate','operatorWorkHourlyRate']) {
    const raw=String(formData.get(key)??'').trim().replace(',','.')
    if(!/^\d+(\.\d{1,2})?$/.test(raw)||Number(raw)>(key==='minimumOrder'?9999999.99:9999.99)) return {error:'Sisesta kõik hinnad numbritena kuni kahe komakohaga. Tunnihind võib olla 0–9999,99 €.'}
    value[key]=Number(raw)
  }
  const db=await createClient()
  const {error}=await db.from('settings').upsert({key:'pricing',value,updated_by:user.id})
  if(error) return {error:'Hindade salvestamine ei õnnestunud. Proovi uuesti.'}
  revalidatePath('/manager','layout')
  return {success:'Üldhinnad salvestatud. Uued objektid kasutavad neid hindu; varasemate objektide hinnad säilivad.'}
}

export async function addWorkType(formData: FormData) {
  await requireUser('manager')
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return
  const supabase = await createClient()
  await supabase.from('work_types').insert({ name, active: true, seasonal: formData.get('seasonal') === 'on' })
  revalidatePath('/manager/settings')
}

export async function toggleWorkType(formData: FormData) {
  await requireUser('manager')
  const id = String(formData.get('id') ?? '')
  const active = formData.get('active') === 'true'
  const supabase = await createClient()
  await supabase.from('work_types').update({ active: !active }).eq('id', id)
  revalidatePath('/manager/settings')
}
