import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOsrmRouteMatrix, optimizeRouteOsrm } from './osrm.ts'
import type { ResolvedRoutePoint } from './coordinates.ts'

function point(id: string, latitude: number, longitude: number): ResolvedRoutePoint {
  return { id, address:id, latitude, longitude }
}

function matrixResponse(url: string, nullFirst = false) {
  const parsed = new URL(url)
  const sourceCount = (parsed.searchParams.get('sources') || '').split(';').filter(Boolean).length
  const destinationCount = (parsed.searchParams.get('destinations') || '').split(';').filter(Boolean).length
  const durations = Array.from({ length:sourceCount }, (_, row) =>
    Array.from({ length:destinationCount }, (_, col) => nullFirst && row === 0 && col === 0 ? null : row + col + 1),
  )
  const distances = Array.from({ length:sourceCount }, (_, row) =>
    Array.from({ length:destinationCount }, (_, col) => nullFirst && row === 0 && col === 0 ? null : (row + col + 1) * 100),
  )
  return new Response(JSON.stringify({ code:'Ok', durations, distances }), { status:200 })
}

test('OSRM matrix chunks large point sets without an app-side stop limit', async () => {
  const points = Array.from({ length:45 }, (_, index) => point(`P${index}`, 58 + index / 1000, 24 + index / 1000))
  const coordinateCounts: number[] = []
  const fakeFetch: typeof fetch = async (input) => {
    const url = String(input)
    const coordinates = new URL(url).pathname.split('/').pop()?.split(';') ?? []
    coordinateCounts.push(coordinates.length)
    return matrixResponse(url)
  }

  const matrices = await buildOsrmRouteMatrix(points, 'https://router.project-osrm.org', fakeFetch)
  assert.ok(coordinateCounts.length > 1)
  assert.ok(coordinateCounts.every((count) => count <= 40))
  for (const from of points) for (const to of points) {
    assert.equal(Number.isFinite(matrices.duration[from.id]?.[to.id]), true, `${from.id}->${to.id} duration`)
    assert.equal(Number.isFinite(matrices.distance[from.id]?.[to.id]), true, `${from.id}->${to.id} distance`)
  }
})

test('OSRM optimizer preserves duplicate coordinate visits as distinct stop IDs', async () => {
  const start = point('start', 59.30, 24.70)
  const a1 = point('A1', 59.40, 24.80)
  const a2 = point('A2', 59.40, 24.80)
  const end = point('end', 59.30, 24.70)
  const fakeFetch: typeof fetch = async (input) => matrixResponse(String(input))

  const result = await optimizeRouteOsrm(start, [a1, a2], end, 'https://router.project-osrm.org', fakeFetch)
  assert.equal(result.proposal.source, 'osrm-matrix')
  assert.equal(result.proposal.orderedStopIds.length, 2)
  assert.deepEqual(new Set(result.proposal.orderedStopIds), new Set(['A1','A2']))
  assert.equal(Number.isFinite(result.current.durationSeconds), true)
})

test('OSRM rejects null/unroutable matrix cells instead of inventing a cost', async () => {
  const points = [point('A',59.3,24.7), point('B',59.4,24.8)]
  const fakeFetch: typeof fetch = async (input) => matrixResponse(String(input), true)
  await assert.rejects(
    buildOsrmRouteMatrix(points, 'https://router.project-osrm.org', fakeFetch),
    /osrm-unroutable/,
  )
})
