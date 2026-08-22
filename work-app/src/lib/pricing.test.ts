import test from 'node:test'
import assert from 'node:assert/strict'
import { calculatePrice, createPriceSnapshot } from './pricing.ts'
import type { PriceSettings } from './domain.ts'

const settings: PriceSettings = {
  hourlyRate: 45,
  minimumOrder: 90,
  driveHourlyRate: 45,
  kmRate: 1,
  helperHourlyRate: 35,
}

test('minimum order applies when calculated work is below minimum', () => {
  const result = calculatePrice({ liftHours: 1, driveHours: 0, km: 0, helperHours: 0, adjustment: 0 }, settings)
  assert.equal(result.total, 90)
})

test('all pricing components are calculated separately', () => {
  const result = calculatePrice({ liftHours: 3, driveHours: 1, km: 20, helperHours: 2, adjustment: 10 }, settings)
  assert.deepEqual(result, {
    lift: 135,
    drive: 45,
    distance: 20,
    helper: 70,
    adjustment: 10,
    subtotal: 280,
    total: 280,
  })
})

test('price snapshot is not changed by later settings edits', () => {
  const mutable = { ...settings }
  const snapshot = createPriceSnapshot(mutable, '2026-08-22T16:00:00.000Z')
  mutable.hourlyRate = 60
  assert.equal(snapshot.hourlyRate, 45)
  assert.equal(snapshot.capturedAt, '2026-08-22T16:00:00.000Z')
})
