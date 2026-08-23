import test from 'node:test'
import assert from 'node:assert/strict'
import { optimizeSmallRouteGoogle } from './google-routes.ts'

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
