export type RoutePoint = { id: string; address: string }

export type RouteMetrics = {
  durationSeconds: number
  distanceMeters: number | null
}

export type RouteProposal = RouteMetrics & {
  orderedStopIds: string[]
  source: 'google-waypoint' | 'matrix-heuristic'
}

export type RouteOptimizationResult = {
  current: RouteMetrics
  proposal: RouteProposal
}

export type DurationMatrix = Record<string, Record<string, number>>
export type DistanceMatrix = Record<string, Record<string, number>>
