import { optimizeFixedEndpoints, pathMetrics } from './optimizer.ts'
import type {
  DistanceMatrix,
  DurationMatrix,
  RouteMetrics,
  RouteOptimizationResult,
  RoutePoint,
  RouteProposal,
} from './types.ts'

export type FetchLike = typeof fetch
export type Sleep = (ms: number) => Promise<void>

const COMPUTE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes'
const COMPUTE_MATRIX_URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix'
const MATRIX_CHUNK_SIZE = 25
const MATRIX_ELEMENT_BUDGET = 2900
const MATRIX_WINDOW_MS = 60_000

const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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

function chunk<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size))
}

export async function buildGoogleRouteMatrix(
  points: RoutePoint[],
  apiKey: string,
  fetchImpl: FetchLike = fetch,
  sleepImpl: Sleep = defaultSleep,
): Promise<{ duration: DurationMatrix; distance: DistanceMatrix }> {
  if (!apiKey.trim()) throw new Error('Google Routes API key missing')
  if (!points.length) return { duration: {}, distance: {} }

  const duration: DurationMatrix = {}
  const distance: DistanceMatrix = {}
  for (const point of points) {
    duration[point.id] = {}
    distance[point.id] = {}
  }

  const chunks = chunk(points, MATRIX_CHUNK_SIZE)
  let windowStarted = Date.now()
  let elementsUsed = 0

  for (const originChunk of chunks) {
    for (const destinationChunk of chunks) {
      const elements = originChunk.length * destinationChunk.length
      const now = Date.now()
      if (now - windowStarted >= MATRIX_WINDOW_MS) {
        windowStarted = now
        elementsUsed = 0
      }
      if (elementsUsed + elements > MATRIX_ELEMENT_BUDGET) {
        await sleepImpl(Math.max(0, MATRIX_WINDOW_MS - (now - windowStarted)))
        windowStarted = Date.now()
        elementsUsed = 0
      }
      elementsUsed += elements

      const response = await fetchImpl(COMPUTE_MATRIX_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,status,condition',
        },
        body: JSON.stringify({
          origins: originChunk.map((point) => ({ waypoint: { address: point.address } })),
          destinations: destinationChunk.map((point) => ({ waypoint: { address: point.address } })),
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
          regionCode: 'ee',
        }),
      })

      if (!response.ok) throw new Error(`Google Route Matrix failed: ${response.status}`)
      const payload = await response.json() as any
      if (!Array.isArray(payload)) throw new Error('Google Route Matrix returned invalid response')

      for (const element of payload) {
        const originIndex = Number(element?.originIndex)
        const destinationIndex = Number(element?.destinationIndex)
        const origin = originChunk[originIndex]
        const destination = destinationChunk[destinationIndex]
        if (!origin || !destination) throw new Error('Google Route Matrix returned invalid indexes')
        if (element?.condition !== 'ROUTE_EXISTS') throw new Error('Google Route Matrix route missing')
        if (Number(element?.status?.code ?? 0) !== 0) throw new Error('Google Route Matrix element failed')
        duration[origin.id][destination.id] = parseDurationSeconds(element.duration)
        if (Number.isFinite(Number(element.distanceMeters))) {
          distance[origin.id][destination.id] = Number(element.distanceMeters)
        }
      }
    }
  }

  for (const origin of points) {
    for (const destination of points) {
      if (!Number.isFinite(duration[origin.id]?.[destination.id])) {
        throw new Error(`Google Route Matrix incomplete: ${origin.id} -> ${destination.id}`)
      }
    }
  }

  return { duration, distance }
}

export async function optimizeLargeRouteGoogle(
  start: RoutePoint,
  stops: RoutePoint[],
  end: RoutePoint,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
  sleepImpl: Sleep = defaultSleep,
): Promise<RouteOptimizationResult> {
  const points = [start, ...stops, end]
  const matrix = await buildGoogleRouteMatrix(points, apiKey, fetchImpl, sleepImpl)
  const current = pathMetrics(start.id, stops.map((stop) => stop.id), end.id, matrix.duration, matrix.distance)
  const orderedStopIds = optimizeFixedEndpoints(start.id, stops.map((stop) => stop.id), end.id, matrix.duration)
  const optimizedMetrics = pathMetrics(start.id, orderedStopIds, end.id, matrix.duration, matrix.distance)

  return {
    current,
    proposal: {
      ...optimizedMetrics,
      orderedStopIds,
      source: 'matrix-heuristic',
    },
  }
}
