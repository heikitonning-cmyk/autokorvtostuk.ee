import type { RouteMetrics, RouteOptimizationResult, RoutePoint, RouteProposal } from './types.ts'

export type FetchLike = typeof fetch

const COMPUTE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes'

function parseDurationSeconds(value: unknown) {
  const text = String(value ?? '').trim()
  const match = text.match(/^([0-9]+(?:\.[0-9]+)?)s$/)
  if (!match) throw new Error('Google route duration missing')
  return Math.round(Number(match[1]))
}

function routeMetrics(route: any): RouteMetrics {
  return {
    durationSeconds: parseDurationSeconds(route?.duration),
    distanceMeters: Number.isFinite(Number(route?.distanceMeters)) ? Number(route.distanceMeters) : null,
  }
}

async function computeRoutes(
  start: RoutePoint,
  stops: RoutePoint[],
  end: RoutePoint,
  apiKey: string,
  optimizeWaypointOrder: boolean,
  fetchImpl: FetchLike,
) {
  if (stops.length > 25) throw new Error('Google direct route supports at most 25 stops')
  if (!apiKey.trim()) throw new Error('Google Routes API key missing')

  const fieldMask = optimizeWaypointOrder
    ? 'routes.optimizedIntermediateWaypointIndex,routes.duration,routes.distanceMeters'
    : 'routes.duration,routes.distanceMeters'
  const response = await fetchImpl(COMPUTE_ROUTES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify({
      origin: { address: start.address },
      destination: { address: end.address },
      intermediates: stops.map((stop) => ({ address: stop.address })),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      regionCode: 'ee',
      optimizeWaypointOrder,
    }),
  })

  if (!response.ok) throw new Error(`Google Routes API failed: ${response.status}`)
  const payload = await response.json() as any
  const route = payload?.routes?.[0]
  if (!route) throw new Error('Google Routes API returned no route')
  return route
}

export async function estimateOrderedRouteGoogle(
  start: RoutePoint,
  stops: RoutePoint[],
  end: RoutePoint,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<RouteMetrics> {
  const route = await computeRoutes(start, stops, end, apiKey, false, fetchImpl)
  return routeMetrics(route)
}

export async function optimizeWaypointsGoogle(
  start: RoutePoint,
  stops: RoutePoint[],
  end: RoutePoint,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<RouteProposal> {
  const route = await computeRoutes(start, stops, end, apiKey, true, fetchImpl)
  const indexes = Array.isArray(route.optimizedIntermediateWaypointIndex)
    ? route.optimizedIntermediateWaypointIndex.map(Number)
    : stops.map((_, index) => index)

  if (indexes.length !== stops.length || indexes.some((index: number) => !Number.isInteger(index) || index < 0 || index >= stops.length)) {
    throw new Error('Google Routes API returned invalid waypoint order')
  }

  return {
    ...routeMetrics(route),
    orderedStopIds: indexes.map((index: number) => stops[index].id),
    source: 'google-waypoint',
  }
}

export async function optimizeSmallRouteGoogle(
  start: RoutePoint,
  stops: RoutePoint[],
  end: RoutePoint,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<RouteOptimizationResult> {
  if (stops.length > 25) throw new Error('Google direct route supports at most 25 stops')
  const current = await estimateOrderedRouteGoogle(start, stops, end, apiKey, fetchImpl)
  const proposal = await optimizeWaypointsGoogle(start, stops, end, apiKey, fetchImpl)
  return { current, proposal }
}
