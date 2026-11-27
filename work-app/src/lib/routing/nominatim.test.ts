import test from 'node:test'
import assert from 'node:assert/strict'
import { buildNominatimSearch, parseNominatimResult } from './nominatim.ts'

test('Nominatim search is Estonia-scoped and address based', () => {
  const url = buildNominatimSearch('Tartu mnt 1, Tallinn', 'https://nominatim.openstreetmap.org')
  assert.equal(url.origin, 'https://nominatim.openstreetmap.org')
  assert.equal(url.pathname, '/search')
  assert.equal(url.searchParams.get('format'), 'jsonv2')
  assert.equal(url.searchParams.get('limit'), '1')
  assert.equal(url.searchParams.get('countrycodes'), 'ee')
  assert.equal(url.searchParams.get('q'), 'Tartu mnt 1, Tallinn')
})

test('Nominatim parser accepts only finite valid coordinates', () => {
  assert.deepEqual(parseNominatimResult([{ lat:'59.437', lon:'24.753' }]), { latitude:59.437, longitude:24.753 })
  assert.equal(parseNominatimResult([]), null)
  assert.equal(parseNominatimResult([{ lat:'nope', lon:'24.7' }]), null)
  assert.equal(parseNominatimResult([{ lat:'91', lon:'24.7' }]), null)
  assert.equal(parseNominatimResult([{ lat:'59.4', lon:'181' }]), null)
})
