'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { canTransition, completionStatus } from '@/lib/status'
import { calculatePrice } from '@/lib/pricing'
import { getPricingSettings } from '@/lib/queries'

export async function startJob(formData: FormData) {
  const user = await requireUser('operator')
  const id = String(formData.get('id') ?? '')
  const supabase = await createClient()
  const { data: job } = await supabase.from('jobs').select('id,status,operator_id').eq('id', id).single()
  if (!job || job.operator_id !== user.id || !canTransition(job.status, 'toob')) redirect('/operator?error=start')
  const { error } = await supabase.from('jobs').update({ status: 'toob', actual_start: new Date().toISOString() }).eq('id', id).eq('operator_id', user.id)
  if (error) redirect(`/operator/jobs/${id}?error=save`)
  revalidatePath('/operator')
  redirect(`/operator/jobs/${id}`)
}

export async function saveWorkNote(formData: FormData) {
  const user = await requireUser('operator')
  const id = String(formData.get('id') ?? '')
  const note = String(formData.get('operatorNote') ?? '').trim()
  const supabase = await createClient()
  await supabase.from('jobs').update({ operator_note: note }).eq('id', id).eq('operator_id', user.id)
  revalidatePath(`/operator/jobs/${id}`)
}

export async function finishJob(formData: FormData) {
  const user = await requireUser('operator')
  const id = String(formData.get('id') ?? '')
  const supabase = await createClient()
  const { data: job } = await supabase.from('jobs').select('*').eq('id', id).eq('operator_id', user.id).single()
  if (!job || job.status !== 'toob' || !job.actual_start) redirect('/operator?error=finish')
  const { count } = await supabase.from('job_photos').select('*', { count: 'exact', head: true }).eq('job_id', id)
  const actualKmRaw = String(formData.get('actualKm') ?? '').trim()
  const actualKm = actualKmRaw === '' ? null : Number(actualKmRaw)
  const validActualKm = actualKm !== null && Number.isFinite(actualKm) ? actualKm : null
  const billingConfirmed = formData.get('billingConfirmed') === 'on'
  const customerConfirmation = formData.get('customerConfirmation') === 'on'
  const status = completionStatus({ actualKm: validActualKm, billingConfirmed, photoCount: count ?? 0 })
  const end = new Date()
  const hours = Math.max(0, (end.getTime() - new Date(job.actual_start).getTime()) / 3600000)
  const snapshot = job.price_snapshot_json ?? await getPricingSettings()
  const helperHours = Number(formData.get('helperHours') ?? 0) || 0
  const price = calculatePrice({
    liftHours: hours,
    driveHours: Number(job.estimated_drive_hours ?? 0),
    km: validActualKm ?? Number(job.estimated_km ?? 0),
    helperHours,
    adjustment: Number(job.manual_adjustment ?? 0),
  }, snapshot)
  const { error } = await supabase.from('jobs').update({
    status,
    actual_end: end.toISOString(),
    actual_km: validActualKm,
    helper_used: helperHours > 0,
    helper_hours: helperHours,
    extra_work_description: String(formData.get('extraWorkDescription') ?? '').trim() || null,
    operator_note: String(formData.get('operatorNote') ?? job.operator_note ?? '').trim() || null,
    billing_confirmed: billingConfirmed,
    customer_confirmation: customerConfirmation,
    actual_total: price.total,
    invoice_status: billingConfirmed ? 'valmis_arveks' : 'puudub',
  }).eq('id', id).eq('operator_id', user.id)
  if (error) redirect(`/operator/jobs/${id}/finish?error=save`)
  revalidatePath('/operator')
  revalidatePath('/manager')
  redirect('/operator?done=1')
}
