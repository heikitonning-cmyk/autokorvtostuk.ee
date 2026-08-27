import type { Coordinates, ResolvedRoutePoint } from './coordinates.ts'
import type { RouteOptimizationResult, RoutePoint } from './types.ts'

export type FallbackRoutePoint = RoutePoint & {
  siteId?: string | null
  stopId?: string | null
  coordinates?: Coordinates | null
}

type GoogleOptimizer = (
  start: RoutePoint,
  stops: RoutePoint[],
  end: RoutePoint,
  apiKey: string,
) => Promise<RouteOptimizationResult>

type CoordinateResolver = (point: FallbackRoutePoint) => Promise<ResolvedRoutePoint>

type OsrmOptimizer = (
  start: ResolvedRoutePoint,
  stops: ResolvedRoutePoint[],
  end: ResolvedRoutePoint,
) => Promise<RouteOptimizationResult>

export async function optimizeWithFallback(input: {
  start: FallbackRoutePoint
  stops: FallbackRoutePoint[]
  end: FallbackRoutePoint
  googleApiKey?: string | null
  google: GoogleOptimizer
  resolve: CoordinateResolver
  osrm: OsrmOptimizer
}): Promise<RouteOptimizationResult> {
  const googleApiKey = input.googleApiKey?.trim()
  if (googleApiKey) {
    try {
      return await input.google(input.start, input.stops, input.end, googleApiKey)
    } catch {
      // Google is an enhancement, not a job-execution dependency.
    }
  }

  const resolved: ResolvedRoutePoint[] = []
  for (const point of [input.start, ...input.stops, input.end]) {
    resolved.push(await input.resolve(point))
  }

  return input.osrm(
    resolved[0],
    resolved.slice(1, -1),
    resolved[resolved.length - 1],
  )
}
