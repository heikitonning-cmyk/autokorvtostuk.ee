import test from 'node:test'
import assert from 'node:assert/strict'
import { validateNewJob, validateFinishJob } from './jobs.ts'

test('new job requires customer, planned start, address and work type', () => {
  const result = validateNewJob({ customerId: '', startPlanned: '', address: '', workTypeId: '', operatorId: '' })
  assert.deepEqual(result, ['customerId', 'startPlanned', 'address', 'workTypeId', 'operatorId'])
})

test('valid new job has no missing fields', () => {
  const result = validateNewJob({
    customerId: 'c1', startPlanned: '2026-08-22T10:00:00+03:00', address: 'Koivu 12', workTypeId: 'w1', operatorId: 'u1'
  })
  assert.deepEqual(result, [])
})

test('finish validation requires kilometres, billing confirmation and at least one photo', () => {
  assert.deepEqual(validateFinishJob({ actualKm: null, billingConfirmed: false, photoCount: 0 }), ['actualKm', 'billingConfirmed', 'photo'])
  assert.deepEqual(validateFinishJob({ actualKm: 10, billingConfirmed: true, photoCount: 1 }), [])
})
