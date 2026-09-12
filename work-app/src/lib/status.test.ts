import test from 'node:test'
import assert from 'node:assert/strict'
import { canTransition, completionStatus } from './status.ts'

test('confirmed job can start', () => {
  assert.equal(canTransition('kinnitatud', 'toob'), true)
})

test('cancelled job cannot start', () => {
  assert.equal(canTransition('tuhistatud', 'toob'), false)
})

test('active job can finish normally or require follow-up', () => {
  assert.equal(canTransition('toob', 'tehtud'), true)
  assert.equal(canTransition('toob', 'vajab_jareltegevust'), true)
})

test('completion requires km, billing confirmation and a photo', () => {
  assert.equal(completionStatus({ actualKm: 12, billingConfirmed: true, photoCount: 1 }), 'tehtud')
  assert.equal(completionStatus({ actualKm: null, billingConfirmed: true, photoCount: 1 }), 'vajab_jareltegevust')
  assert.equal(completionStatus({ actualKm: 12, billingConfirmed: false, photoCount: 1 }), 'vajab_jareltegevust')
  assert.equal(completionStatus({ actualKm: 12, billingConfirmed: true, photoCount: 0 }), 'vajab_jareltegevust')
})
