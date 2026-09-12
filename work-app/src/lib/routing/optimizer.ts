import type { DistanceMatrix, DurationMatrix, RouteMetrics } from './types.ts'

function durationLeg(matrix: DurationMatrix, from: string, to: string) {
  const value = matrix[from]?.[to]
  if (!Number.isFinite(value)) throw new Error(`Missing route duration: ${from} -> ${to}`)
  return value
}

function durationCost(startId: string, stopIds: string[], endId: string, matrix: DurationMatrix) {
  let total = 0
  let current = startId
  for (const stopId of stopIds) {
    total += durationLeg(matrix, current, stopId)
    current = stopId
  }
  total += durationLeg(matrix, current, endId)
  return total
}

function nearestNeighbor(startId: string, stopIds: string[], matrix: DurationMatrix) {
  const remaining = [...stopIds]
  const ordered: string[] = []
  let current = startId

  while (remaining.length) {
    let bestIndex = 0
    for (let index = 1; index < remaining.length; index += 1) {
      if (durationLeg(matrix, current, remaining[index]) < durationLeg(matrix, current, remaining[bestIndex])) {
        bestIndex = index
      }
    }
    const [next] = remaining.splice(bestIndex, 1)
    ordered.push(next)
    current = next
  }

  return ordered
}

export function optimizeFixedEndpoints(
  startId: string,
  stopIds: string[],
  endId: string,
  matrix: DurationMatrix,
): string[] {
  if (stopIds.length < 2) return [...stopIds]

  let best = nearestNeighbor(startId, stopIds, matrix)
  let bestCost = durationCost(startId, best, endId, matrix)
  let improved = true

  while (improved) {
    improved = false
    for (let from = 0; from < best.length - 1; from += 1) {
      for (let to = from + 1; to < best.length; to += 1) {
        const candidate = [
          ...best.slice(0, from),
          ...best.slice(from, to + 1).reverse(),
          ...best.slice(to + 1),
        ]
        const candidateCost = durationCost(startId, candidate, endId, matrix)
        if (candidateCost < bestCost) {
          best = candidate
          bestCost = candidateCost
          improved = true
        }
      }
    }
  }

  return best
}

export function pathMetrics(
  startId: string,
  stopIds: string[],
  endId: string,
  duration: DurationMatrix,
  distance: DistanceMatrix,
): RouteMetrics {
  let durationSeconds = 0
  let distanceMeters = 0
  let hasAllDistances = true
  let current = startId

  for (const next of [...stopIds, endId]) {
    durationSeconds += durationLeg(duration, current, next)
    const meters = distance[current]?.[next]
    if (!Number.isFinite(meters)) hasAllDistances = false
    else distanceMeters += meters
    current = next
  }

  return {
    durationSeconds,
    distanceMeters: hasAllDistances ? distanceMeters : null,
  }
}
