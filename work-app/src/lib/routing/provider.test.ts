import test from 'node:test'
import assert from 'node:assert/strict'
import { optimizeWithFallback } from './provider.ts'
import type { ResolvedRoutePoint } from './coordinates.ts'
import type { RouteOptimizationResult, RoutePoint } from './types.ts'

const start: RoutePoint = { id:'start', address:'Start' }
const stops: RoutePoint[] = [{ id:'A',address:'A' }, { id:'B',address:'B' }]
const end: RoutePoint = { id:'end', address:'End' }
const result = (source: 'google-waypoint' | 'osrm-matrix'): RouteOptimizationResult => ({
  current:{ durationSeconds:120, distanceMeters:1000 },
  proposal:{ durationSeconds:90, distanceMeters:900, orderedStopIds:['B','A'], source },
})
const resolved = (point: RoutePoint): ResolvedRoutePoint => ({ ...point, latitude:59.4, longitude:24.7 })

test('configured healthy Google wins without resolving OSRM coordinates', async () => {
  let resolves = 0
  let osrmCalls = 0
  const output = await optimizeWithFallback({
    start, stops, end, googleApiKey:'secret',
    google: async () => result('google-waypoint'),
    resolve: async (point) => { resolves += 1; return resolved(point) },
    osrm: async () => { osrmCalls += 1; return result('osrm-matrix') },
  })
  assert.equal(output.proposal.source, 'google-waypoint')
  assert.equal(resolves, 0)
  assert.equal(osrmCalls, 0)
})

test('missing Google key resolves coordinates and uses OSRM once', async () => {
  const resolvedIds: string[] = []
  let googleCalls = 0
  let osrmCalls = 0
  const output = await optimizeWithFallback({
    start, stops, end,
    google: async () => { googleCalls += 1; return result('google-waypoint') },
    resolve: async (point) => { resolvedIds.push(point.id); return resolved(point) },
    osrm: async () => { osrmCalls += 1; return result('osrm-matrix') },
  })
  assert.equal(output.proposal.source, 'osrm-matrix')
  assert.equal(googleCalls, 0)
  assert.deepEqual(resolvedIds, ['start','A','B','end'])
  assert.equal(osrmCalls, 1)
})

test('Google provider failure falls back to OSRM', async () => {
  let osrmCalls = 0
  const output = await optimizeWithFallback({
    start, stops, end, googleApiKey:'secret',
    google: async () => { throw new Error('quota') },
    resolve: async (point) => resolved(point),
    osrm: async () => { osrmCalls += 1; return result('osrm-matrix') },
  })
  assert.equal(output.proposal.source, 'osrm-matrix')
  assert.equal(osrmCalls, 1)
})

test('OSRM failure is surfaced after Google failure without an automatic mutation', async () => {
  await assert.rejects(
    optimizeWithFallback({
      start, stops, end, googleApiKey:'secret',
      google: async () => { throw new Error('google down') },
      resolve: async (point) => resolved(point),
      osrm: async () => { throw new Error('osrm down') },
    }),
    /osrm down/,
  )
})
