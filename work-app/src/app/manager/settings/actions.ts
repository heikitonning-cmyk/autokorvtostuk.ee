'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

const n = (v: FormDataEntryValue | null, fallback: number) => {
  if (v == null || String(v).trim() === '') return fallback
  const x = Number(v)
  return Number.isFinite(x) && x >= 0 ? x : fallback
}

export async function updatePricing(formData: FormData) {
  const user = await requireUser('manager')
  const value = {
    hourlyRate: n(formData.get('hourlyRate'), 45),
    minimumOrder: n(formData.get('minimumOrder'), 90),
    driveHourlyRate: n(formData.get('driveHourlyRate'), 45),
    kmRate: n(formData.get('kmRate'), 1),
    helperHourlyRate: n(formData.get('helperHourlyRate'), 35),
    operatorWorkHourlyRate: n(formData.get('operatorWorkHourlyRate'), 15),
  }
  const supabase = await createClient()
  const { error } = await supabase.from('settings').upsert({ key: 'pricing', value, updated_by: user.id })
  if (error) throw new Error('Hindade salvestamine ei õnnestunud.')
  revalidatePath('/manager/settings')
  revalidatePath('/manager/jobs/new')
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
