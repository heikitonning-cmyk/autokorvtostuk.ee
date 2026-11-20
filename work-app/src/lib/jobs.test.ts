import test from 'node:test'
import assert from 'node:assert/strict'
import * as jobsModule from './jobs.ts'

const { validateNewJob, validateFinishJob } = jobsModule

test('new job accepts all fields empty', () => {
  const result = validateNewJob({ customerId: '', startPlanned: '', address: '', workTypeId: '', operatorId: '' })
  assert.deepEqual(result, [])
})

test('valid populated new job still has no missing fields', () => {
  const result = validateNewJob({
    customerId: 'c1', startPlanned: '2026-08-22T10:00:00+03:00', address: 'Koivu 12', workTypeId: 'w1', operatorId: 'u1'
  })
  assert.deepEqual(result, [])
})

test('empty planned datetime normalizes to null', () => {
  assert.ok('optionalIsoDateTime' in jobsModule, 'optionalIsoDateTime must exist')
  assert.equal((jobsModule as any).optionalIsoDateTime(''), null)
})

test('planned datetime-local is interpreted in Tallinn time', () => {
  assert.ok('optionalIsoDateTime' in jobsModule, 'optionalIsoDateTime must exist')
  assert.equal((jobsModule as any).optionalIsoDateTime('2026-08-23T10:00'), '2026-08-23T07:00:00.000Z')
})

test('separate planned date and time combine in Tallinn time', () => {
  assert.ok('combinePlannedDateTime' in jobsModule, 'combinePlannedDateTime must exist')
  assert.equal((jobsModule as any).combinePlannedDateTime('2026-08-23', '10:30'), '2026-08-23T07:30:00.000Z')
})

test('planned date without time remains unscheduled', () => {
  assert.ok('combinePlannedDateTime' in jobsModule, 'combinePlannedDateTime must exist')
  assert.equal((jobsModule as any).combinePlannedDateTime('2026-08-23', ''), null)
})

test('date-only schedule shows date and Aeg määramata', () => {
  assert.ok('formatPlannedSchedule' in jobsModule, 'formatPlannedSchedule must exist')
  assert.equal((jobsModule as any).formatPlannedSchedule(null, '2026-08-23', null, null), '23.08.2026 · Aeg määramata')
})

test('missing planned time is shown as Aeg määramata', () => {
  assert.ok('formatPlannedTime' in jobsModule, 'formatPlannedTime must exist')
  assert.equal((jobsModule as any).formatPlannedTime(null), 'Aeg määramata')
})

test('save error formatter exposes the real database error', () => {
  assert.ok('formatSaveError' in jobsModule, 'formatSaveError must exist')
  const text = (jobsModule as any).formatSaveError({ code: '23502', message: 'null value violates not-null constraint', details: 'customer_id' })
  assert.match(text, /23502/)
  assert.match(text, /null value violates not-null constraint/)
  assert.match(text, /customer_id/)
})

test('finish validation requires kilometres, billing confirmation and at least one photo', () => {
  assert.deepEqual(validateFinishJob({ actualKm: null, billingConfirmed: false, photoCount: 0 }), ['actualKm', 'billingConfirmed', 'photo'])
  assert.deepEqual(validateFinishJob({ actualKm: 10, billingConfirmed: true, photoCount: 1 }), [])
})
