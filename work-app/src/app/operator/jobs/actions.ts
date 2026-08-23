'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireView } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { canTransition, completionStatus } from '@/lib/status'
import { calculatePrice } from '@/lib/pricing'
import { getPricingSettings } from '@/lib/queries'

function stopErrorCode(message: string | undefined) {
  const value = String(message ?? '').toLowerCase()
  if (value.includes('completion note required')) return 'note-required'
  if (value.includes('stop photo required')) return 'photo-required'
  if (value.includes('not assigned') || value.includes('operator')) return 'not-assigned'
  return 'stop-state'
}

function revalidateJob(jobId: string) {
  revalidatePath('/operator')
  revalidatePath('/manager')
  revalidatePath(`/operator/jobs/${jobId}`)
  revalidatePath(`/manager/jobs/${jobId}`)
}

export async function startJob(formData: FormData) {
  const user = await requireView('worker')
  const id = String(formData.get('id') ?? '')
  const supabase = await createClient()
  const { data: job } = await supabase.from('jobs').select('id,status,operator_id').eq('id', id).single()
  if (!job || job.operator_id !== user.id || !canTransition(job.status, 'toob')) redirect('/operator?error=start')
  const { error } = await supabase.from('jobs').update({ status: 'toob', actual_start: new Date().toISOString() }).eq('id', id).eq('operator_id', user.id)
  if (error) redirect(`/operator/jobs/${id}?error=save`)
  revalidatePath('/operator')
  revalidatePath('/manager')
  redirect(`/operator/jobs/${id}`)
}

export async function startJobStop(formData: FormData) {
  await requireView('worker')
  const jobId = String(formData.get('jobId') ?? '')
  const stopId = String(formData.get('stopId') ?? '')
  const supabase = await createClient()
  const { error } = await supabase.rpc('start_job_stop', { p_stop_id: stopId })
  if (error) redirect(`/operator/jobs/${jobId}?error=${stopErrorCode(error.message)}`)
  revalidateJob(jobId)
  redirect(`/operator/jobs/${jobId}`)
}

export async function completeJobStop(formData: FormData) {
  await requireView('worker')
  const jobId = String(formData.get('jobId') ?? '')
  const stopId = String(formData.get('stopId') ?? '')
  const note = String(formData.get('completionNote') ?? '').trim()
  if (!note) redirect(`/operator/jobs/${jobId}?error=note-required`)
  const supabase = await createClient()
  const { error } = await supabase.rpc('complete_job_stop', { p_stop_id: stopId, p_note: note })
  if (error) redirect(`/operator/jobs/${jobId}?error=${stopErrorCode(error.message)}`)
  revalidateJob(jobId)
  redirect(`/operator/jobs/${jobId}`)
}

export async function skipJobStop(formData: FormData) {
  await requireView('worker')
  const jobId = String(formData.get('jobId') ?? '')
  const stopId = String(formData.get('stopId') ?? '')
  const note = String(formData.get('completionNote') ?? '').trim()
  if (!note) redirect(`/operator/jobs/${jobId}?error=note-required`)
  const supabase = await createClient()
  const { error } = await supabase.rpc('skip_job_stop', { p_stop_id: stopId, p_note: note })
  if (error) redirect(`/operator/jobs/${jobId}?error=${stopErrorCode(error.message)}`)
  revalidateJob(jobId)
  redirect(`/operator/jobs/${jobId}`)
}

export async function saveWorkNote(formData: FormData) {
  const user = await requireView('worker')
  const id = String(formData.get('id') ?? '')
  const note = String(formData.get('operatorNote') ?? '').trim()
  const supabase = await createClient()
  await supabase.from('jobs').update({ operator_note: note }).eq('id', id).eq('operator_id', user.id)
  revalidatePath(`/operator/jobs/${id}`)
}

export async function finishJob(formData: FormData) {
  const user = await requireView('worker')
  const id = String(formData.get('id') ?? '')
  const supabase = await createClient()
  const { data: job } = await supabase.from('jobs').select('*').eq('id', id).eq('operator_id', user.id).single()
  if (!job || job.status !== 'toob' || !job.actual_start) redirect('/operator?error=finish')

  const { data: stops, error: stopsError } = await supabase
    .from('job_stops')
    .select('status')
    .eq('job_id', id)
  if (stopsError) redirect(`/operator/jobs/${id}?error=save`)
  if ((stops?.length ?? 0) > 0 && stops!.some((stop) => stop.status === 'pending' || stop.status === 'in_progress')) {
    redirect(`/operator/jobs/${id}?error=stops-open`)
  }

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
