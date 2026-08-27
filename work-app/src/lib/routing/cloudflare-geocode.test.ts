import test from 'node:test'
import assert from 'node:assert/strict'
import { geocodeThroughThrottle } from './cloudflare-geocode.ts'

test('Cloudflare geocode adapter always targets the global Durable Object', async () => {
  const calls: unknown[] = []
  const namespace = {
    idFromName(name: string) {
      calls.push(['idFromName', name])
      return `id:${name}`
    },
    get(id: unknown) {
      calls.push(['get', id])
      return {
        async fetch(_input: RequestInfo | URL, init?: RequestInit) {
          calls.push(['fetch', init?.method, JSON.parse(String(init?.body))])
          return new Response(JSON.stringify({ latitude:59.4, longitude:24.7 }), { status:200 })
        },
      }
    },
  }

  const result = await geocodeThroughThrottle(namespace, 'Luige, Estonia')
  assert.deepEqual(result, { latitude:59.4, longitude:24.7 })
  assert.deepEqual(calls, [
    ['idFromName', 'global'],
    ['get', 'id:global'],
    ['fetch', 'POST', { address:'Luige, Estonia' }],
  ])
})

test('Cloudflare geocode adapter maps not-found to null and provider errors to a stable failure', async () => {
  const namespace = (status: number) => ({
    idFromName: () => 'id',
    get: () => ({ fetch: async () => new Response('{}', { status }) }),
  })
  assert.equal(await geocodeThroughThrottle(namespace(404), 'Unknown'), null)
  await assert.rejects(geocodeThroughThrottle(namespace(502), 'Broken'), /geocode-provider-failed/)
})
