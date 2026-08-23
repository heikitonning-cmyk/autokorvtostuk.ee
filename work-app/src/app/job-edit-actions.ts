'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { formatSaveError } from '@/lib/jobs'

const text = (value: FormDataEntryValue | null) => {
  const result = String(value ?? '').trim()
  return result || null
}

const number = (value: FormDataEntryValue | null) => {
  const result = Number(String(value ?? '').trim() || 0)
  return Number.isFinite(result) ? result : 0
}

export async function updateJob(formData: FormData) {
  const user = await requireUser()
  const id = String(formData.get('id') ?? '').trim()
  const requestedView = String(formData.get('view') ?? 'worker')
  const managerView = user.role === 'manager' && requestedView === 'manager'
  const editPath = managerView ? `/manager/jobs/${id}/edit` : `/operator/jobs/${id}/edit`
  const detailPath = managerView ? `/manager/jobs/${id}` : `/operator/jobs/${id}`

  const supabase = await createClient()
  const { error } = await supabase.rpc('update_editable_job', {
    p_job_id: id,
    p_customer_id: text(formData.get('customerId')),
    p_vehicle_id: text(formData.get('vehicleId')),
    p_planned_date: text(formData.get('plannedDate')),
    p_planned_time: text(formData.get('plannedTime')),
    p_planned_end_time: text(formData.get('plannedEndTime')),
    p_address: text(formData.get('address')),
    p_object_name: text(formData.get('objectName')),
    p_work_type_id: text(formData.get('workTypeId')),
    p_description: text(formData.get('description')),
    p_access_notes: text(formData.get('accessNotes')),
    p_estimated_hours: number(formData.get('estimatedHours')),
    p_estimated_drive_hours: number(formData.get('estimatedDriveHours')),
    p_estimated_km: number(formData.get('estimatedKm')),
    p_estimated_helper_hours: number(formData.get('estimatedHelperHours')),
    p_manual_adjustment: number(formData.get('manualAdjustment')),
    p_manual_adjustment_reason: text(formData.get('adjustmentReason')),
  })

  if (error) redirect(`${editPath}?error=${encodeURIComponent(formatSaveError(error))}`)

  revalidatePath('/manager')
  revalidatePath('/manager/calendar')
  revalidatePath('/operator')
  revalidatePath(`/manager/jobs/${id}`)
  revalidatePath(`/operator/jobs/${id}`)
  redirect(`${detailPath}?saved=1`)
}
