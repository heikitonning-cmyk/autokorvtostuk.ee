'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getBaseLocation } from '@/lib/queries'
import { optimizeLargeRouteGoogle, optimizeSmallRouteGoogle } from '@/lib/routing/google-routes'
import { optimizeRouteOsrm } from '@/lib/routing/osrm'
import { optimizeWithFallback, type FallbackRoutePoint } from '@/lib/routing/provider'
import { resolveCoordinates } from '@/lib/routing/geocode'
import { createSupabaseGeocodeStore } from '@/lib/routing/geocode-store'
import { geocodeThroughConfiguredThrottle } from '@/lib/routing/cloudflare-geocode'
import { isCoordinates, type Coordinates } from '@/lib/routing/coordinates'
import type { RouteOptimizationResult } from '@/lib/routing/types'

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

function stopCoordinates(stop: any): Coordinates | null {
  const coordinates = {
    latitude: Number(stop?.latitude_snapshot),
    longitude: Number(stop?.longitude_snapshot),
  }
  return stop?.latitude_snapshot == null || stop?.longitude_snapshot == null || !isCoordinates(coordinates)
    ? null
    : coordinates
}

function siteCoordinates(site: any, expectedAddress: string): Coordinates | null {
  if (!site || String(site.address ?? '').trim() !== expectedAddress.trim()) return null
  if (String(site.geocode_address_snapshot ?? '').trim() !== String(site.address ?? '').trim()) return null
  const coordinates = { latitude:Number(site.latitude), longitude:Number(site.longitude) }
  return site.latitude == null || site.longitude == null || !isCoordinates(coordinates) ? null : coordinates
}

export async function proposeRouteOptimization(input: {
  jobId: string
  mode: OptimizationMode
}): Promise<ProposalResult> {
  await requireUser()
  if (!input.jobId || !['all', 'remaining'].includes(input.mode)) return { ok: false, error: 'routing-failed' }

  const supabase = await createClient()
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id,status,route_revision,route_start_site_id,route_start_address,route_end_site_id,route_end_address')
    .eq('id', input.jobId)
    .single()
  if (jobError || !job || ['tehtud', 'vajab_jareltegevust', 'tuhistatud'].includes(job.status)) {
    return { ok: false, error: 'routing-failed' }
  }

  const { data: rawStops, error: stopsError } = await supabase
    .from('job_stops')
    .select('id,site_id,sequence_no,name_snapshot,address_snapshot,status,actual_start,actual_end,latitude_snapshot,longitude_snapshot')
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

  const endpointSiteIds = [job.route_start_site_id, job.route_end_site_id].filter(Boolean) as string[]
  const endpointSites = new Map<string, any>()
  if (endpointSiteIds.length) {
    const { data, error } = await supabase
      .from('customer_sites')
      .select('id,address,latitude,longitude,geocode_address_snapshot')
      .in('id', endpointSiteIds)
    if (error) return { ok: false, error: 'routing-failed' }
    for (const site of data ?? []) endpointSites.set(String(site.id), site)
  }

  let effectiveStart = routeStart
  let effectiveStartStop: any = null
  if (input.mode === 'remaining') {
    const active = stops.find((stop: any) => stop.status === 'in_progress')
    const reachedTerminal = [...stops]
      .reverse()
      .find((stop: any) => ['done', 'skipped'].includes(stop.status) && Boolean(stop.actual_start))
    effectiveStartStop = active ?? reachedTerminal ?? null
    effectiveStart = String(effectiveStartStop?.address_snapshot || routeStart).trim()
  }
  if (!effectiveStart) return { ok: false, error: 'route-endpoint-missing' }

  const start: FallbackRoutePoint = effectiveStartStop
    ? {
        id:'__route_start__',
        address:effectiveStart,
        siteId:effectiveStartStop.site_id ?? null,
        stopId:effectiveStartStop.id,
        coordinates:stopCoordinates(effectiveStartStop),
      }
    : {
        id:'__route_start__',
        address:effectiveStart,
        siteId:job.route_start_site_id ?? null,
        coordinates:siteCoordinates(endpointSites.get(String(job.route_start_site_id ?? '')), effectiveStart),
      }

  const end: FallbackRoutePoint = {
    id:'__route_end__',
    address:routeEnd,
    siteId:job.route_end_site_id ?? null,
    coordinates:siteCoordinates(endpointSites.get(String(job.route_end_site_id ?? '')), routeEnd),
  }

  const movable: FallbackRoutePoint[] = pending.map((stop: any) => ({
    id:String(stop.id),
    address:String(stop.address_snapshot || '').trim(),
    siteId:stop.site_id ?? null,
    stopId:String(stop.id),
    coordinates:stopCoordinates(stop),
  }))
  if (movable.some((stop) => !stop.address)) return { ok: false, error: 'route-endpoint-missing' }

  const store = createSupabaseGeocodeStore(supabase)
  try {
    const result = await optimizeWithFallback({
      start,
      stops:movable,
      end,
      googleApiKey:process.env.GOOGLE_MAPS_ROUTES_API_KEY,
      google:async (googleStart, googleStops, googleEnd, apiKey) => googleStops.length <= 25
        ? optimizeSmallRouteGoogle(googleStart, googleStops, googleEnd, apiKey)
        : optimizeLargeRouteGoogle(googleStart, googleStops, googleEnd, apiKey),
      resolve:(point) => resolveCoordinates({
        point,
        siteId:point.siteId ?? null,
        stopId:point.stopId ?? null,
        snapshot:point.coordinates ?? null,
        store,
        geocode:geocodeThroughConfiguredThrottle,
      }),
      osrm:(resolvedStart, resolvedStops, resolvedEnd) => optimizeRouteOsrm(
        resolvedStart,
        resolvedStops,
        resolvedEnd,
        process.env.OSRM_BASE_URL || 'https://router.project-osrm.org',
      ),
    })
    return {
      ok: true,
      result,
      stopNames: Object.fromEntries(pending.map((stop: any) => [String(stop.id), String(stop.name_snapshot || stop.address_snapshot)])),
      routeRevision: Number(job.route_revision ?? 0),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return { ok: false, error: message.includes('geocode-failed') ? 'geocode-failed' : 'routing-failed' }
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
