'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export type StopMutationResult = {
  ok: boolean
  revision?: number
  error?: 'stale-route' | 'save'
}

const integer = (value: FormDataEntryValue | null, fallback = 0) => {
  const parsed = Number(String(value ?? ''))
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

const mutationError = (error: { message?: string } | null): StopMutationResult => ({
  ok: false,
  error: error?.message?.toLowerCase().includes('stale route revision') ? 'stale-route' : 'save',
})

function refreshJob(jobId: string) {
  revalidatePath('/manager')
  revalidatePath('/operator')
  revalidatePath(`/manager/jobs/${jobId}`)
  revalidatePath(`/manager/jobs/${jobId}/edit`)
  revalidatePath(`/operator/jobs/${jobId}`)
  revalidatePath(`/operator/jobs/${jobId}/edit`)
}

function parseStops(raw: FormDataEntryValue | null) {
  let value: unknown
  try { value = JSON.parse(String(raw ?? '[]')) } catch { return null }
  if (!Array.isArray(value) || value.length === 0) return null
  const stops = value.map((item: any) => ({
    siteId: String(item?.siteId ?? '').trim() || null,
    name: String(item?.name ?? '').trim(),
    address: String(item?.address ?? '').trim(),
    description: String(item?.description ?? '').trim() || null,
  }))
  if (stops.some((stop) => !stop.address)) return null
  return stops
}

export async function addStopsAction(formData: FormData): Promise<StopMutationResult> {
  await requireUser()
  const jobId = String(formData.get('jobId') ?? '')
  const expectedRevision = integer(formData.get('expectedRevision'))
  const stops = parseStops(formData.get('stopsJson'))
  if (!jobId || !stops) return { ok: false, error: 'save' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('add_job_stops', {
    p_job_id: jobId,
    p_stops: stops,
    p_expected_revision: expectedRevision,
  })
  if (error) return mutationError(error)
  refreshJob(jobId)
  return { ok: true, revision: Number(data) }
}

export async function reorderStopsAction(formData: FormData): Promise<StopMutationResult> {
  await requireUser()
  const jobId = String(formData.get('jobId') ?? '')
  const expectedRevision = integer(formData.get('expectedRevision'))
  let stopIds: string[] = []
  try {
    const value = JSON.parse(String(formData.get('stopIdsJson') ?? '[]'))
    if (Array.isArray(value)) stopIds = value.map(String)
  } catch { return { ok: false, error: 'save' } }
  if (!jobId) return { ok: false, error: 'save' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('reorder_job_stops', {
    p_job_id: jobId,
    p_stop_ids: stopIds,
    p_expected_revision: expectedRevision,
  })
  if (error) return mutationError(error)
  refreshJob(jobId)
  return { ok: true, revision: Number(data) }
}

export async function updateRouteEndpointsAction(formData: FormData): Promise<StopMutationResult> {
  await requireUser()
  const jobId = String(formData.get('jobId') ?? '')
  const expectedRevision = integer(formData.get('expectedRevision'))
  if (!jobId) return { ok: false, error: 'save' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('update_job_route_endpoints', {
    p_job_id: jobId,
    p_start_site_id: String(formData.get('routeStartSiteId') ?? '').trim() || null,
    p_start_address: String(formData.get('routeStartAddress') ?? '').trim() || null,
    p_end_site_id: String(formData.get('routeEndSiteId') ?? '').trim() || null,
    p_end_address: String(formData.get('routeEndAddress') ?? '').trim() || null,
    p_expected_revision: expectedRevision,
  })
  if (error) return mutationError(error)
  refreshJob(jobId)
  return { ok: true, revision: Number(data) }
}

export async function updateStopDescriptionAction(formData: FormData): Promise<StopMutationResult> {
  await requireUser()
  const jobId = String(formData.get('jobId') ?? '')
  const stopId = String(formData.get('stopId') ?? '')
  const expectedRevision = integer(formData.get('expectedRevision'))
  const description = String(formData.get('description') ?? '').trim()
  if (!jobId || !stopId) return { ok: false, error: 'save' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('update_job_stop_description', {
    p_stop_id: stopId,
    p_description: description || null,
    p_expected_revision: expectedRevision,
  })
  if (error) return mutationError(error)
  refreshJob(jobId)
  return { ok: true, revision: Number(data) }
}
