import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGoogleRouteMatrix, optimizeLargeRouteGoogle, optimizeSmallRouteGoogle } from './google-routes.ts'

test('Google small-route optimizer compares current and proposed order', async () => {
  const bodies: any[] = []
  const headers: Headers[] = []
  const fakeFetch: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body))
    bodies.push(body)
    headers.push(new Headers(init?.headers))
    const optimized = body.optimizeWaypointOrder === true
    return new Response(JSON.stringify({ routes:[{
      optimizedIntermediateWaypointIndex: optimized ? [1,0] : undefined,
      duration: optimized ? '90s' : '120s',
      distanceMeters: optimized ? 1000 : 1200,
    }] }), { status:200 })
  }

  const result = await optimizeSmallRouteGoogle(
    {id:'S',address:'Luige, Estonia'},
    [{id:'A',address:'A'},{id:'B',address:'B'}],
    {id:'E',address:'Luige, Estonia'},
    'secret', fakeFetch,
  )

  assert.equal(bodies.length, 2)
  assert.equal(bodies[0].optimizeWaypointOrder, false)
  assert.equal(bodies[1].optimizeWaypointOrder, true)
  assert.equal(bodies[1].routingPreference, 'TRAFFIC_AWARE')
  assert.equal(bodies[1].regionCode, 'ee')
  assert.equal(headers[1].get('X-Goog-Api-Key'), 'secret')
  assert.match(headers[1].get('X-Goog-FieldMask') ?? '', /optimizedIntermediateWaypointIndex/)
  assert.deepEqual(result.proposal.orderedStopIds, ['B','A'])
  assert.equal(result.current.durationSeconds, 120)
  assert.equal(result.proposal.durationSeconds, 90)
})

test('direct Google waypoint optimization rejects more than 25 stops', async () => {
  const stops = Array.from({ length: 26 }, (_, index) => ({ id: `S${index}`, address: `A${index}` }))
  await assert.rejects(
    optimizeSmallRouteGoogle({id:'start',address:'Start'}, stops, {id:'end',address:'End'}, 'secret'),
    /25/,
  )
})

test('route matrix chunks more than 25 points without exceeding Google request limits', async () => {
  const points = Array.from({ length: 31 }, (_, index) => ({ id: `P${index}`, address: `Address ${index}` }))
  const requests: any[] = []
  const fakeFetch: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body))
    requests.push(body)
    const elements = body.origins.flatMap((_origin: any, originIndex: number) =>
      body.destinations.map((_destination: any, destinationIndex: number) => ({
        originIndex,
        destinationIndex,
        duration: '10s',
        distanceMeters: 1000,
        condition: 'ROUTE_EXISTS',
        status: {},
      })),
    )
    return new Response(JSON.stringify(elements), { status: 200 })
  }

  const matrix = await buildGoogleRouteMatrix(points, 'secret', fakeFetch, async () => {})
  assert.ok(requests.length > 1)
  assert.ok(requests.every((request) => request.origins.length <= 25))
  assert.ok(requests.every((request) => request.destinations.length <= 25))
  assert.ok(requests.every((request) => request.origins.length * request.destinations.length <= 625))
  assert.equal(matrix.duration.P0.P30, 10)
  assert.equal(matrix.distance.P30.P0, 1000)
})

test('large route optimizer compares current path with a matrix heuristic proposal', async () => {
  const fakeFetch: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body))
    const elements = body.origins.flatMap((origin: any, originIndex: number) =>
      body.destinations.map((destination: any, destinationIndex: number) => {
        const from = Number(String(origin.waypoint.address).replace('A', ''))
        const to = Number(String(destination.waypoint.address).replace('A', ''))
        return {
          originIndex,
          destinationIndex,
          duration: `${Math.max(1, Math.abs(to - from))}s`,
          distanceMeters: Math.max(1, Math.abs(to - from)) * 100,
          condition: 'ROUTE_EXISTS',
          status: {},
        }
      }),
    )
    return new Response(JSON.stringify(elements), { status: 200 })
  }
  const stops = Array.from({ length: 26 }, (_, index) => ({ id: `P${index + 1}`, address: `A${index + 1}` })).reverse()
  const result = await optimizeLargeRouteGoogle(
    { id: 'start', address: 'A0' },
    stops,
    { id: 'end', address: 'A27' },
    'secret',
    fakeFetch,
    async () => {},
  )
  assert.equal(result.proposal.source, 'matrix-heuristic')
  assert.equal(result.proposal.orderedStopIds.length, 26)
  assert.ok(result.proposal.durationSeconds <= result.current.durationSeconds)
})
