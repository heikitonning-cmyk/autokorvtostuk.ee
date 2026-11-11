import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveCoordinates, type GeocodeStore } from './geocode.ts'

function storeWith(initial: { latitude:number; longitude:number } | null) {
  const saves: unknown[] = []
  const store: GeocodeStore = {
    async get() { return initial },
    async save(input) { saves.push(input) },
  }
  return { store, saves }
}

test('coordinate resolver prefers snapshot and never hits cache or provider', async () => {
  let gets = 0
  let geocodes = 0
  const store: GeocodeStore = {
    async get() { gets += 1; return null },
    async save() { throw new Error('save should not run') },
  }
  const result = await resolveCoordinates({
    point: { id:'A', address:'Aadress 1' },
    snapshot: { latitude:59.4, longitude:24.7 },
    store,
    geocode: async () => { geocodes += 1; return null },
  })
  assert.equal(gets, 0)
  assert.equal(geocodes, 0)
  assert.deepEqual(result, { id:'A', address:'Aadress 1', latitude:59.4, longitude:24.7 })
})

test('coordinate resolver uses generic cache before geocoding', async () => {
  let geocodes = 0
  const { store, saves } = storeWith({ latitude:59.5, longitude:24.8 })
  const result = await resolveCoordinates({
    point: { id:'B', address:'  Tartu  mnt 1, Tallinn ' },
    store,
    geocode: async () => { geocodes += 1; throw new Error('provider should not run') },
  })
  assert.equal(geocodes, 0)
  assert.equal(saves.length, 0)
  assert.equal(result.id, 'B')
  assert.equal(result.latitude, 59.5)
  assert.equal(result.longitude, 24.8)
})

test('coordinate resolver geocodes once and persists a cache miss', async () => {
  const { store, saves } = storeWith(null)
  let geocodes = 0
  const result = await resolveCoordinates({
    point: { id:'C', address:'Pärnu mnt 10, Tallinn' },
    siteId: 'site-1',
    stopId: 'stop-1',
    store,
    geocode: async (address) => {
      geocodes += 1
      assert.equal(address, 'Pärnu mnt 10, Tallinn')
      return { latitude:59.41, longitude:24.72 }
    },
  })
  assert.equal(geocodes, 1)
  assert.equal(saves.length, 1)
  assert.deepEqual(saves[0], {
    normalizedAddress:'pärnu mnt 10, tallinn',
    address:'Pärnu mnt 10, Tallinn',
    coordinates:{ latitude:59.41, longitude:24.72 },
    siteId:'site-1',
    stopId:'stop-1',
  })
  assert.equal(result.id, 'C')
})

test('coordinate resolver fails cleanly when address cannot be geocoded', async () => {
  const { store } = storeWith(null)
  await assert.rejects(
    resolveCoordinates({ point:{ id:'D',address:'Unknown address' }, store, geocode:async()=>null }),
    /geocode-failed/,
  )
})
