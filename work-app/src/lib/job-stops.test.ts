import test from 'node:test'
import assert from 'node:assert/strict'
import { filterSites, nextPendingStop, canFinishStops, wazeUrl } from './job-stops.ts'

test('site search matches name address city and county case-insensitively', () => {
  const sites = [{ id:'1', customer_id:'n', name:'Pirita', address:'Rummu tee 2, Tallinn', city:'Tallinn', county:'Harjumaa' }]
  assert.equal(filterSites(sites, 'rummu', '').length, 1)
  assert.equal(filterSites(sites, 'PIR', '').length, 1)
  assert.equal(filterSites(sites, 'harju', '').length, 1)
  assert.equal(filterSites(sites, '', 'Tallinn').length, 1)
  assert.equal(filterSites(sites, '', 'Tartu').length, 0)
})

test('next pending stop follows sequence order', () => {
  const stops = [
    { id:'b', status:'pending' as const, sequence_no: 20 },
    { id:'a', status:'pending' as const, sequence_no: 10 },
    { id:'x', status:'done' as const, sequence_no: 1 },
  ]
  assert.equal(nextPendingStop(stops)?.id, 'a')
})

test('job can finish only when every stop is terminal', () => {
  assert.equal(canFinishStops([{ status:'done' }, { status:'skipped' }] as any), true)
  assert.equal(canFinishStops([{ status:'done' }, { status:'pending' }] as any), false)
  assert.equal(canFinishStops([]), false)
})

test('Waze URL encodes the exact stop address', () => {
  assert.equal(wazeUrl('Rummu tee 2, Tallinn'), 'https://www.waze.com/ul?q=Rummu%20tee%202%2C%20Tallinn&navigate=yes')
})
