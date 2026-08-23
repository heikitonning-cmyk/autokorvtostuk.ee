'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { formatSaveError } from '@/lib/jobs'
import { normalizeSiteChoice } from '@/lib/customer-sites'

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
  const customerId = text(formData.get('customerId'))
  const choice = normalizeSiteChoice({
    siteId: String(formData.get('siteId') ?? ''),
    newSiteName: String(formData.get('newSiteName') ?? ''),
    newSiteAddress: String(formData.get('newSiteAddress') ?? ''),
  })

  const supabase = await createClient()
  let siteId = choice.siteId
  let siteName: string | null = null
  let siteAddress: string | null = null

  if (siteId) {
    if (!customerId) redirect(`${editPath}?error=${encodeURIComponent('Asukoha valimiseks peab olema valitud klient.')}`)
    const { data: site, error: siteError } = await supabase
      .from('customer_sites')
      .select('id,name,address')
      .eq('id', siteId)
      .eq('customer_id', customerId)
      .single()
    if (siteError || !site) redirect(`${editPath}?error=${encodeURIComponent(formatSaveError(siteError ?? { message: 'Valitud asukoht ei kuulu valitud kliendile.' }))}`)
    siteName = site.name
    siteAddress = site.address
  } else if (choice.newSite && customerId) {
    const { data: newSite, error: siteError } = await supabase.from('customer_sites').insert({
      customer_id: customerId,
      name: choice.newSite.name,
      address: choice.newSite.address,
      source: 'manual',
      active: true,
    }).select('id,name,address').single()
    if (siteError || !newSite) redirect(`${editPath}?error=${encodeURIComponent(formatSaveError(siteError ?? { message: 'Uue asukoha loomine ei õnnestunud.' }))}`)
    siteId = newSite.id
    siteName = newSite.name
    siteAddress = newSite.address
  }

  const { error } = await supabase.rpc('update_editable_job', {
    p_job_id: id,
    p_customer_id: customerId,
    p_site_id: siteId,
    p_vehicle_id: text(formData.get('vehicleId')),
    p_planned_date: text(formData.get('plannedDate')),
    p_planned_time: text(formData.get('plannedTime')),
    p_planned_end_time: text(formData.get('plannedEndTime')),
    p_address: text(formData.get('address')) ?? siteAddress,
    p_object_name: text(formData.get('objectName')) ?? siteName,
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
  revalidatePath('/manager/customers')
  revalidatePath('/manager/jobs/new')
  revalidatePath('/operator')
  revalidatePath(`/manager/jobs/${id}`)
  revalidatePath(`/operator/jobs/${id}`)
  redirect(`${detailPath}?saved=1`)
}
