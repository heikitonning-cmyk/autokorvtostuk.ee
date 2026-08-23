'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireView } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message ?? fallback)
  return fallback
}

export async function claimJob(formData: FormData) {
  await requireView('worker')
  const id = String(formData.get('id') ?? '')
  const supabase = await createClient()
  const { error } = await supabase.rpc('claim_job', { p_job_id: id })
  if (error) redirect(`/operator?error=${encodeURIComponent(errorMessage(error, 'Töö võtmine ei õnnestunud.'))}`)
  revalidatePath('/operator')
  revalidatePath('/manager')
  revalidatePath('/manager/calendar')
  redirect('/operator?claimed=1')
}

export async function releaseJob(formData: FormData) {
  await requireView('worker')
  const id = String(formData.get('id') ?? '')
  const supabase = await createClient()
  const { error } = await supabase.rpc('release_job', { p_job_id: id })
  if (error) redirect(`/operator?error=${encodeURIComponent(errorMessage(error, 'Töö vabastamine ei õnnestunud.'))}`)
  revalidatePath('/operator')
  revalidatePath('/manager')
  revalidatePath('/manager/calendar')
  redirect('/operator?released=1')
}
