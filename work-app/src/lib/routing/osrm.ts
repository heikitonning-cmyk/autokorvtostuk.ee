import type { ResolvedRoutePoint } from './coordinates.ts'
import { optimizeFixedEndpoints, pathMetrics } from './optimizer.ts'
import type { DistanceMatrix, DurationMatrix, RouteOptimizationResult } from './types.ts'

const CHUNK_SIZE = 20

const chunk = <T,>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size))

function ensureRow<T>(matrix: Record<string, Record<string, T>>, id: string) {
  matrix[id] ??= {}
  return matrix[id]
}

export async function buildOsrmRouteMatrix(
  points: ResolvedRoutePoint[],
  baseUrl = 'https://router.project-osrm.org',
  fetchImpl: typeof fetch = fetch,
): Promise<{ duration: DurationMatrix; distance: DistanceMatrix }> {
  if (points.length === 0) return { duration:{}, distance:{} }
  if (new Set(points.map((point) => point.id)).size !== points.length) throw new Error('osrm-duplicate-point-id')

  const duration: DurationMatrix = {}
  const distance: DistanceMatrix = {}
  const sourceChunks = chunk(points, CHUNK_SIZE)
  const destinationChunks = chunk(points, CHUNK_SIZE)

  for (const sources of sourceChunks) {
    for (const destinations of destinationChunks) {
      const requestPoints = [...sources, ...destinations]
      const coordinates = requestPoints
        .map((point) => `${point.longitude},${point.latitude}`)
        .join(';')
      const url = new URL(`/table/v1/driving/${coordinates}`, baseUrl)
      url.searchParams.set('sources', sources.map((_, index) => String(index)).join(';'))
      url.searchParams.set('destinations', destinations.map((_, index) => String(sources.length + index)).join(';'))
      url.searchParams.set('annotations', 'duration,distance')

      const response = await fetchImpl(url)
      if (!response.ok) throw new Error(`osrm-failed:${response.status}`)
      const payload = await response.json() as any
      if (payload?.code !== 'Ok' || !Array.isArray(payload.durations) || !Array.isArray(payload.distances)) {
        throw new Error('osrm-failed')
      }
      if (payload.durations.length !== sources.length || payload.distances.length !== sources.length) {
        throw new Error('osrm-failed')
      }

      for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
        const durationRow = payload.durations[sourceIndex]
        const distanceRow = payload.distances[sourceIndex]
        if (!Array.isArray(durationRow) || !Array.isArray(distanceRow)
          || durationRow.length !== destinations.length || distanceRow.length !== destinations.length) {
          throw new Error('osrm-failed')
        }

        for (let destinationIndex = 0; destinationIndex < destinations.length; destinationIndex += 1) {
          const seconds = Number(durationRow[destinationIndex])
          const meters = Number(distanceRow[destinationIndex])
          if (durationRow[destinationIndex] == null || distanceRow[destinationIndex] == null
            || !Number.isFinite(seconds) || !Number.isFinite(meters)) {
            throw new Error('osrm-unroutable')
          }
          ensureRow(duration, sources[sourceIndex].id)[destinations[destinationIndex].id] = seconds
          ensureRow(distance, sources[sourceIndex].id)[destinations[destinationIndex].id] = meters
        }
      }
    }
  }

  return { duration, distance }
}

export async function optimizeRouteOsrm(
  start: ResolvedRoutePoint,
  stops: ResolvedRoutePoint[],
  end: ResolvedRoutePoint,
  baseUrl = 'https://router.project-osrm.org',
  fetchImpl: typeof fetch = fetch,
): Promise<RouteOptimizationResult> {
  const { duration, distance } = await buildOsrmRouteMatrix([start, ...stops, end], baseUrl, fetchImpl)
  const currentStopIds = stops.map((stop) => stop.id)
  const current = pathMetrics(start.id, currentStopIds, end.id, duration, distance)
  const orderedStopIds = optimizeFixedEndpoints(start.id, currentStopIds, end.id, duration)
  const proposed = pathMetrics(start.id, orderedStopIds, end.id, duration, distance)

  return {
    current,
    proposal: {
      ...proposed,
      orderedStopIds,
      source: 'osrm-matrix',
    },
  }
}
