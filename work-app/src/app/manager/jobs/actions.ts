'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getPricingSettings } from '@/lib/queries'
import { calculatePrice, createPriceSnapshot } from '@/lib/pricing'
import { combinePlannedDateTime, formatSaveError } from '@/lib/jobs'
import { normalizeSiteChoice } from '@/lib/customer-sites'

const num = (value: FormDataEntryValue | null, fallback = 0) => {
  const text = String(value ?? '').trim()
  if (!text) return fallback
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : fallback
}

const optionalText = (value: FormDataEntryValue | null) => {
  const text = String(value ?? '').trim()
  return text || null
}

function parseInitialStops(value: FormDataEntryValue | null) {
  const raw = String(value ?? '').trim()
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed.map((item: any) => ({
      siteId: String(item?.siteId ?? '').trim() || null,
      name: String(item?.name ?? '').trim(),
      address: String(item?.address ?? '').trim(),
      description: String(item?.description ?? '').trim() || null,
    }))
  } catch {
    return null
  }
}

export async function createJob(formData: FormData) {
  const user = await requireUser('manager')
  const settings = await getPricingSettings()
  const priceInput = {
    liftHours: num(formData.get('estimatedHours'), 2),
    driveHours: num(formData.get('estimatedDriveHours')),
    km: num(formData.get('estimatedKm')),
    helperHours: num(formData.get('estimatedHelperHours')),
    adjustment: num(formData.get('manualAdjustment')),
  }
  const price = calculatePrice(priceInput, settings)
  const plannedDate = optionalText(formData.get('plannedDate'))
  const plannedTime = optionalText(formData.get('plannedTime'))
  const plannedEndTime = optionalText(formData.get('plannedEndTime'))
  const customerId = optionalText(formData.get('customerId'))
  const initialStops = parseInitialStops(formData.get('initialStopsJson'))
  if (initialStops === null || initialStops.some((stop) => !stop.address)) {
    redirect(`/manager/jobs/new?error=${encodeURIComponent('Peatuste andmed ei ole korrektsed.')}`)
  }

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
    if (!customerId) redirect(`/manager/jobs/new?error=${encodeURIComponent('Asukoha valimiseks peab olema valitud klient.')}`)
    const { data: site, error: siteError } = await supabase
      .from('customer_sites')
      .select('id,name,address')
      .eq('id', siteId)
      .eq('customer_id', customerId)
      .single()
    if (siteError || !site) redirect(`/manager/jobs/new?error=${encodeURIComponent(formatSaveError(siteError ?? { message: 'Valitud asukoht ei kuulu valitud kliendile.' }))}`)
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
    if (siteError || !newSite) redirect(`/manager/jobs/new?error=${encodeURIComponent(formatSaveError(siteError ?? { message: 'Uue asukoha loomine ei õnnestunud.' }))}`)
    siteId = newSite.id
    siteName = newSite.name
    siteAddress = newSite.address
  }

  const objectName = optionalText(formData.get('objectName')) ?? siteName
  const address = optionalText(formData.get('address')) ?? siteAddress

  const { data, error } = await supabase.from('jobs').insert({
    customer_id: customerId,
    site_id: siteId,
    vehicle_id: optionalText(formData.get('vehicleId')),
    operator_id: null,
    planned_date: plannedDate,
    planned_time: plannedTime,
    planned_end_time: plannedEndTime,
    start_planned: combinePlannedDateTime(plannedDate, plannedTime),
    end_planned: combinePlannedDateTime(plannedDate, plannedEndTime),
    address,
    object_name: objectName,
    work_type_id: optionalText(formData.get('workTypeId')),
    description: optionalText(formData.get('description')),
    access_notes: optionalText(formData.get('accessNotes')),
    status: 'uus',
    estimated_total: price.total,
    estimated_hours: priceInput.liftHours,
    estimated_drive_hours: priceInput.driveHours,
    estimated_km: priceInput.km,
    estimated_helper_hours: priceInput.helperHours,
    manual_adjustment: priceInput.adjustment,
    manual_adjustment_reason: optionalText(formData.get('adjustmentReason')),
    helper_used: priceInput.helperHours > 0,
    created_by: user.id,
  }).select('id').single()

  if (error) redirect(`/manager/jobs/new?error=${encodeURIComponent(formatSaveError(error))}`)
  if (!data) redirect(`/manager/jobs/new?error=${encodeURIComponent('Supabase ei tagastanud loodud töö ID-d.')}`)

  if (initialStops.length > 0) {
    const { error: stopsError } = await supabase.rpc('add_job_stops', {
      p_job_id: data.id,
      p_stops: initialStops,
      p_expected_revision: 0,
    })
    if (stopsError) {
      await supabase.from('jobs').delete().eq('id', data.id)
      redirect(`/manager/jobs/new?error=${encodeURIComponent(formatSaveError(stopsError))}`)
    }
  }

  revalidatePath('/manager')
  revalidatePath('/manager/calendar')
  revalidatePath('/manager/customers')
  revalidatePath('/manager/jobs/new')
  revalidatePath('/operator')
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
  revalidatePath('/operator')
  revalidatePath(`/manager/jobs/${id}`)
}

export async function cancelJob(formData: FormData) {
  await requireUser('manager')
  const id = String(formData.get('id') ?? '')
  const supabase = await createClient()
  await supabase.from('jobs').update({ status: 'tuhistatud' }).eq('id', id)
  revalidatePath('/manager')
  revalidatePath('/operator')
  revalidatePath(`/manager/jobs/${id}`)
}
