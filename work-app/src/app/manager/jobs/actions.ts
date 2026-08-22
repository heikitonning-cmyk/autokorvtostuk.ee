'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getPricingSettings } from '@/lib/queries'
import { calculatePrice, createPriceSnapshot } from '@/lib/pricing'
import { validateNewJob } from '@/lib/jobs'

const num = (value: FormDataEntryValue | null, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function createJob(formData: FormData) {
  const user = await requireUser('manager')
  const input = {
    customerId: String(formData.get('customerId') ?? ''),
    startPlanned: String(formData.get('startPlanned') ?? ''),
    address: String(formData.get('address') ?? '').trim(),
    workTypeId: String(formData.get('workTypeId') ?? ''),
    operatorId: String(formData.get('operatorId') ?? ''),
  }
  if (validateNewJob(input).length) redirect('/manager/jobs/new?error=required')

  const settings = await getPricingSettings()
  const priceInput = {
    liftHours: num(formData.get('estimatedHours'), 2),
    driveHours: num(formData.get('estimatedDriveHours')),
    km: num(formData.get('estimatedKm')),
    helperHours: num(formData.get('estimatedHelperHours')),
    adjustment: num(formData.get('manualAdjustment')),
  }
  const price = calculatePrice(priceInput, settings)
  const supabase = await createClient()
  const { data, error } = await supabase.from('jobs').insert({
    customer_id: input.customerId,
    vehicle_id: String(formData.get('vehicleId') ?? '') || null,
    operator_id: input.operatorId,
    start_planned: new Date(input.startPlanned).toISOString(),
    end_planned: formData.get('endPlanned') ? new Date(String(formData.get('endPlanned'))).toISOString() : null,
    address: input.address,
    object_name: String(formData.get('objectName') ?? '').trim() || null,
    work_type_id: input.workTypeId,
    description: String(formData.get('description') ?? '').trim() || null,
    access_notes: String(formData.get('accessNotes') ?? '').trim() || null,
    status: 'uus',
    estimated_total: price.total,
    estimated_hours: priceInput.liftHours,
    estimated_drive_hours: priceInput.driveHours,
    estimated_km: priceInput.km,
    estimated_helper_hours: priceInput.helperHours,
    manual_adjustment: priceInput.adjustment,
    manual_adjustment_reason: String(formData.get('adjustmentReason') ?? '').trim() || null,
    helper_used: priceInput.helperHours > 0,
    created_by: user.id,
  }).select('id').single()
  if (error || !data) redirect('/manager/jobs/new?error=save')
  revalidatePath('/manager')
  redirect(`/manager/jobs/${data.id}`)
}

export async function confirmJob(formData: FormData) {
  await requireUser('manager')
  const id = String(formData.get('id') ?? '')
  const supabase = await createClient()
  const { data: job } = await supabase.from('jobs').select('*').eq('id', id).single()
  if (!job) return
  const settings = await getPricingSettings()
  const price = calculatePrice({
    liftHours: Number(job.estimated_hours ?? 2),
    driveHours: Number(job.estimated_drive_hours ?? 0),
    km: Number(job.estimated_km ?? 0),
    helperHours: Number(job.estimated_helper_hours ?? 0),
    adjustment: Number(job.manual_adjustment ?? 0),
  }, settings)
  await supabase.from('jobs').update({
    status: 'kinnitatud',
    price_snapshot_json: createPriceSnapshot(settings),
    estimated_total: price.total,
  }).eq('id', id)
  revalidatePath('/manager')
  revalidatePath(`/manager/jobs/${id}`)
}

export async function cancelJob(formData: FormData) {
  await requireUser('manager')
  const id = String(formData.get('id') ?? '')
  const supabase = await createClient()
  await supabase.from('jobs').update({ status: 'tuhistatud' }).eq('id', id)
  revalidatePath('/manager')
  revalidatePath(`/manager/jobs/${id}`)
}
