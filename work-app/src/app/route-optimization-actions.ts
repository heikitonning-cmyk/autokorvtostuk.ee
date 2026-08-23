'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getBaseLocation } from '@/lib/queries'
import { optimizeLargeRouteGoogle, optimizeSmallRouteGoogle } from '@/lib/routing/google-routes'
import type { RouteOptimizationResult, RoutePoint } from '@/lib/routing/types'

type OptimizationMode = 'all' | 'remaining'
type ProposalResult =
  | { ok: true; result: RouteOptimizationResult; stopNames: Record<string, string>; routeRevision: number }
  | { ok: false; error: string }

type ApplyResult =
  | { ok: true; revision: number }
  | { ok: false; error: string }

function refreshJob(jobId: string) {
  revalidatePath('/manager')
  revalidatePath('/operator')
  revalidatePath(`/manager/jobs/${jobId}`)
  revalidatePath(`/operator/jobs/${jobId}`)
  revalidatePath(`/manager/jobs/${jobId}/edit`)
  revalidatePath(`/operator/jobs/${jobId}/edit`)
}

export async function proposeRouteOptimization(input: {
  jobId: string
  mode: OptimizationMode
}): Promise<ProposalResult> {
  await requireUser()
  const apiKey = process.env.GOOGLE_MAPS_ROUTES_API_KEY?.trim()
  if (!apiKey) return { ok: false, error: 'routing-not-configured' }
  if (!input.jobId || !['all', 'remaining'].includes(input.mode)) return { ok: false, error: 'routing-failed' }

  const supabase = await createClient()
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id,status,route_revision,route_start_address,route_end_address')
    .eq('id', input.jobId)
    .single()
  if (jobError || !job || ['tehtud', 'vajab_jareltegevust', 'tuhistatud'].includes(job.status)) {
    return { ok: false, error: 'routing-failed' }
  }

  const { data: rawStops, error: stopsError } = await supabase
    .from('job_stops')
    .select('id,sequence_no,name_snapshot,address_snapshot,status,actual_start,actual_end')
    .eq('job_id', input.jobId)
    .order('sequence_no', { ascending: true })
  if (stopsError) return { ok: false, error: 'routing-failed' }

  const stops = rawStops ?? []
  const pending = stops.filter((stop: any) => stop.status === 'pending')
  if (pending.length < 2) return { ok: false, error: 'nothing-to-optimize' }
  if (input.mode === 'all' && stops.some((stop: any) => Boolean(stop.actual_start))) {
    return { ok: false, error: 'use-remaining' }
  }

  let baseLocation: { label?: string; address?: string }
  try {
    baseLocation = await getBaseLocation()
  } catch {
    return { ok: false, error: 'routing-failed' }
  }

  const routeStart = String(job.route_start_address || baseLocation.address || '').trim()
  const routeEnd = String(job.route_end_address || baseLocation.address || '').trim()
  if (!routeStart || !routeEnd) return { ok: false, error: 'route-endpoint-missing' }

  let effectiveStart = routeStart
  if (input.mode === 'remaining') {
    const active = stops.find((stop: any) => stop.status === 'in_progress')
    const reachedTerminal = [...stops]
      .reverse()
      .find((stop: any) => ['done', 'skipped'].includes(stop.status) && Boolean(stop.actual_start))
    effectiveStart = String(active?.address_snapshot || reachedTerminal?.address_snapshot || routeStart).trim()
  }
  if (!effectiveStart) return { ok: false, error: 'route-endpoint-missing' }

  const start: RoutePoint = { id: '__route_start__', address: effectiveStart }
  const end: RoutePoint = { id: '__route_end__', address: routeEnd }
  const movable: RoutePoint[] = pending.map((stop: any) => ({ id: String(stop.id), address: String(stop.address_snapshot || '').trim() }))
  if (movable.some((stop) => !stop.address)) return { ok: false, error: 'route-endpoint-missing' }

  try {
    const result = movable.length <= 25
      ? await optimizeSmallRouteGoogle(start, movable, end, apiKey)
      : await optimizeLargeRouteGoogle(start, movable, end, apiKey)
    return {
      ok: true,
      result,
      stopNames: Object.fromEntries(pending.map((stop: any) => [String(stop.id), String(stop.name_snapshot || stop.address_snapshot)])),
      routeRevision: Number(job.route_revision ?? 0),
    }
  } catch {
    return { ok: false, error: 'routing-failed' }
  }
}

export async function applyRouteProposal(formData: FormData): Promise<ApplyResult> {
  await requireUser()
  const jobId = String(formData.get('jobId') ?? '').trim()
  const expectedRevision = Number(formData.get('expectedRevision'))
  let orderedStopIds: string[]
  try {
    const parsed = JSON.parse(String(formData.get('orderedStopIdsJson') ?? '[]'))
    if (!Array.isArray(parsed)) throw new Error('invalid')
    orderedStopIds = parsed.map(String)
  } catch {
    return { ok: false, error: 'routing-failed' }
  }

  if (!jobId || !Number.isInteger(expectedRevision) || expectedRevision < 0 || orderedStopIds.length < 2) {
    return { ok: false, error: 'routing-failed' }
  }
  if (new Set(orderedStopIds).size !== orderedStopIds.length) return { ok: false, error: 'routing-failed' }

  const supabase = await createClient()
  const { data: pending, error: pendingError } = await supabase
    .from('job_stops')
    .select('id')
    .eq('job_id', jobId)
    .eq('status', 'pending')
  if (pendingError) return { ok: false, error: 'routing-failed' }

  const currentIds = (pending ?? []).map((stop: any) => String(stop.id))
  if (currentIds.length !== orderedStopIds.length || currentIds.some((id) => !orderedStopIds.includes(id))) {
    return { ok: false, error: 'stale-route' }
  }

  const { data, error } = await supabase.rpc('reorder_job_stops', {
    p_job_id: jobId,
    p_stop_ids: orderedStopIds,
    p_expected_revision: expectedRevision,
  })
  if (error) {
    return {
      ok: false,
      error: error.message?.toLowerCase().includes('stale route revision') ? 'stale-route' : 'routing-failed',
    }
  }

  refreshJob(jobId)
  return { ok: true, revision: Number(data) }
}
