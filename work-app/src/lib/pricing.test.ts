import test from 'node:test'
import assert from 'node:assert/strict'
import * as pricing from './pricing.ts'
const { calculatePrice, createPriceSnapshot } = pricing
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
    operatorWork: 0,
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

test('operator work adds only on-site hours after the existing minimum', () => {
  const result = calculatePrice({ liftHours: 1, driveHours: 1, km: 0, helperHours: 0, adjustment: 0, operatorDoesWork: true }, settings)
  assert.equal(result.operatorWork, 15)
  assert.equal(result.total, 105)
})

test('operator work excludes outside-Tallinn mileage and combines with helpers', () => {
  const result = calculatePrice({ liftHours: 2, driveHours: 0, km: 40, helperHours: 2, adjustment: 0, operatorDoesWork: true }, settings)
  assert.equal(result.operatorWork, 30)
  assert.equal(result.helper, 70)
  assert.equal(result.total, 230)
})

test('minimum does not absorb the optional operator fee', () => {
  assert.equal(calculatePrice({ liftHours: 1, driveHours: 0, km: 0, helperHours: 0, adjustment: 0, operatorDoesWork: true }, settings).total, 105)
})

test('actual operator hours can exclude travel within a multi-stop job', () => {
  const result = calculatePrice({ liftHours: 4, driveHours: 1, km: 0, helperHours: 0, adjustment: 0, operatorDoesWork: true, operatorWorkHours: 2 }, settings)
  assert.equal(result.operatorWork, 30)
  assert.equal(result.total, 255)
})

test('operator fee is zero when disabled or when no operator work was performed', () => {
  for (const input of [{ operatorDoesWork: false, operatorWorkHours: 2 }, { operatorDoesWork: true, operatorWorkHours: 0 }]) {
    assert.equal(calculatePrice({ liftHours: 2, driveHours: 1, km: 20, helperHours: 0, adjustment: 0, ...input }, settings).operatorWork, 0)
  }
})

test('operator rate is frozen in the price snapshot', () => {
  const mutable = { ...settings, operatorWorkHourlyRate: 15 }
  const snapshot = createPriceSnapshot(mutable)
  mutable.operatorWorkHourlyRate = 25
  assert.equal(calculatePrice({ liftHours: 2, driveHours: 0, km: 0, helperHours: 0, adjustment: 0, operatorDoesWork: true }, snapshot).operatorWork, 30)
})

test('imported quoted price is preserved when only the operator option changes', () => {
  const job = { estimated_hours: 2, estimated_drive_hours: 0, estimated_km: 0, estimated_helper_hours: 0, manual_adjustment: 0, estimated_total: 165, operator_does_work: true, operator_work_surcharge: 30 }
  const input = { liftHours: 2, driveHours: 0, km: 0, helperHours: 0, adjustment: 0, operatorDoesWork: false }
  assert.equal(pricing.calculateJobEstimate(job, input, settings).total, 135)
  assert.equal(pricing.calculateJobEstimate(job, { ...input, operatorDoesWork: true }, settings).total, 165)
})

test('existing booking operator rate survives changed app settings', () => {
  const current = { ...settings, operatorWorkHourlyRate: 25 }
  const job = { source: 'website', operator_does_work: true, estimated_hours: 2, operator_work_surcharge: 30 }
  assert.equal(pricing.getJobPricing(job, current).operatorWorkHourlyRate, 15)
  assert.equal(pricing.getJobPricing({ price_snapshot_json: { ...settings, operatorWorkHourlyRate: 12 } }, current).operatorWorkHourlyRate, 12)
  assert.equal(pricing.getJobPricing({}, current).operatorWorkHourlyRate, 25)
})
