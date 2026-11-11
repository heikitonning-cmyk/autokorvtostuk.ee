'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { parseCompletionTime } from '@/lib/jobs'
import { canMarkJobCompleted } from '@/lib/status'

export async function markJobCompleted(_state: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  const user = await requireUser()
  const id = String(formData.get('id') ?? '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { error: 'Tööd ei leitud.' }
  const completedAt = parseCompletionTime(String(formData.get('completedDate') ?? ''), String(formData.get('completedTime') ?? ''))
  if (!completedAt) return { error: 'Vali kehtiv lõpetamise kuupäev ja kellaaeg. Lõpetamine ei saa olla tulevikus.' }
  const supabase = await createClient()
  const { data: job, error: readError } = await supabase.from('jobs').select('id,status,operator_id').eq('id', id).single()
  if (readError || !job || !canMarkJobCompleted(user, job)) return { error: 'Sul puudub selle töö lõpetamise õigus või töö on juba lõpetatud. Värskenda vaadet.' }
  const { error } = await supabase.rpc('mark_job_completed', { p_job_id: id, p_completed_at: completedAt })
  if (error) return { error: 'Töö lõpetamine ei õnnestunud. Värskenda vaadet ja proovi uuesti.' }
  for (const path of ['/manager', '/operator', '/manager/calendar', '/operator/calendar', '/manager/customers', `/manager/jobs/${id}`, `/operator/jobs/${id}`]) revalidatePath(path)
  const view = user.role === 'manager' && formData.get('view') === 'manager' ? 'manager' : 'operator'
  redirect(`/${view}/jobs/${id}?completed=1`)
}
