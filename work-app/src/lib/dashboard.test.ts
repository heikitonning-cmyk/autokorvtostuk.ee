import test from 'node:test'
import assert from 'node:assert/strict'
import { managerSummary } from './dashboard.ts'

const jobs = [
  { id: '1', status: 'uus', start_planned: '2026-08-22T08:00:00+03:00', estimated_total: 90, actual_total: null },
  { id: '2', status: 'kinnitatud', start_planned: '2026-08-22T09:00:00+03:00', estimated_total: 135, actual_total: null },
  { id: '3', status: 'tehtud', start_planned: '2026-08-22T10:00:00+03:00', estimated_total: 150, actual_total: 160 },
  { id: '4', status: 'vajab_jareltegevust', start_planned: '2026-08-22T11:00:00+03:00', estimated_total: 200, actual_total: 210 },
] as const

test('manager summary identifies attention items', () => {
  const result = managerSummary([...jobs], new Date('2026-08-22T10:30:00+03:00'))
  assert.equal(result.newJobs.length, 1)
  assert.equal(result.overdueNotStarted.length, 1)
  assert.equal(result.followUp.length, 1)
})

test('manager summary uses actual total when available', () => {
  const result = managerSummary([...jobs], new Date('2026-08-22T10:30:00+03:00'))
  assert.equal(result.todayRevenue, 90 + 135 + 160 + 210)
})

test('unscheduled confirmed job is not treated as overdue', () => {
  const result = managerSummary([
    { id: 'x', status: 'kinnitatud', start_planned: null, estimated_total: null, actual_total: null } as any,
  ], new Date('2026-08-22T10:30:00+03:00'))
  assert.equal(result.overdueNotStarted.length, 0)
  assert.equal(result.todayJobs.length, 0)
})

test('free capacity shows next seven days with at least two hours available', async () => {
  const { freeCapacityDays } = await import('./dashboard.ts')
  const result = freeCapacityDays([
    { start_planned: '2026-08-23T08:00:00+03:00', end_planned: '2026-08-23T16:00:00+03:00', status: 'kinnitatud' },
    { start_planned: '2026-08-24T10:00:00+03:00', end_planned: '2026-08-24T12:00:00+03:00', status: 'kinnitatud' },
  ], new Date('2026-08-22T12:00:00+03:00'))
  assert.equal(result.some((d) => d.date === '2026-08-23'), false)
  assert.equal(result.find((d) => d.date === '2026-08-24')?.freeHours, 6)
})
