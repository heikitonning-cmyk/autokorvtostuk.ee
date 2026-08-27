import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as dashboardModule from './dashboard.ts'

const { managerSummary } = dashboardModule

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

test('cancelled job is excluded from today count and revenue', () => {
  const result = managerSummary([
    ...jobs,
    { id: 'cancelled', status: 'tuhistatud', start_planned: '2026-08-22T10:15:00+03:00', estimated_total: 999, actual_total: null } as any,
  ], new Date('2026-08-22T10:30:00+03:00'))
  assert.equal(result.todayJobs.some((job) => job.id === 'cancelled'), false)
  assert.equal(result.todayJobs.length, jobs.length)
  assert.equal(result.todayRevenue, 90 + 135 + 160 + 210)
})

test('cancelled job is excluded from rolling 7 and 30 day totals', () => {
  assert.ok('jobsWithinDays' in dashboardModule, 'jobsWithinDays must exist')
  const input = [
    { id: 'active', status: 'kinnitatud', start_planned: '2026-08-24T10:00:00+03:00', estimated_total: 240, actual_total: null },
    { id: 'cancelled', status: 'tuhistatud', start_planned: '2026-08-24T11:00:00+03:00', estimated_total: 999, actual_total: null },
  ] as any[]
  const now = new Date('2026-08-23T10:30:00+03:00')
  const week = (dashboardModule as any).jobsWithinDays(input, 7, now)
  const month = (dashboardModule as any).jobsWithinDays(input, 30, now)
  assert.deepEqual(week.map((job: any) => job.id), ['active'])
  assert.deepEqual(month.map((job: any) => job.id), ['active'])
})

test('unscheduled confirmed job is not treated as overdue', () => {
  const result = managerSummary([
    { id: 'x', status: 'kinnitatud', start_planned: null, estimated_total: null, actual_total: null } as any,
  ], new Date('2026-08-22T10:30:00+03:00'))
  assert.equal(result.overdueNotStarted.length, 0)
  assert.equal(result.todayJobs.length, 0)
})

test('date-only job appears in today without becoming overdue', () => {
  const result = managerSummary([
    { id: 'd', status: 'kinnitatud', start_planned: null, planned_date: '2026-08-22', estimated_total: 90, actual_total: null } as any,
  ], new Date('2026-08-22T10:30:00+03:00'))
  assert.equal(result.todayJobs.length, 1)
  assert.equal(result.overdueNotStarted.length, 0)
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

test('upcoming manager jobs contain only future confirmed jobs in chronological order', () => {
  assert.ok('upcomingJobs' in dashboardModule, 'upcomingJobs must exist')
  const now = new Date('2026-08-23T21:54:00+03:00')
  const input = [
    { id: 'today', status: 'kinnitatud', start_planned: '2026-08-23T22:30:00+03:00', estimated_total: 90, actual_total: null },
    { id: 'september', status: 'kinnitatud', start_planned: '2026-09-26T08:00:00+03:00', estimated_total: 240, actual_total: null },
    { id: 'august', status: 'kinnitatud', start_planned: '2026-08-24T17:00:00+03:00', estimated_total: 120, actual_total: null },
    { id: 'date-only', status: 'kinnitatud', start_planned: null, planned_date: '2026-08-25', estimated_total: 100, actual_total: null },
    { id: 'new', status: 'uus', start_planned: '2026-08-24T09:00:00+03:00', estimated_total: 80, actual_total: null },
    { id: 'cancelled', status: 'tuhistatud', start_planned: '2026-08-24T10:00:00+03:00', estimated_total: 80, actual_total: null },
  ] as any[]
  const result = (dashboardModule as any).upcomingJobs(input, now, 10)
  assert.deepEqual(result.map((job: any) => job.id), ['august', 'date-only', 'september'])
})

test('all manager jobs are ordered today, future, unscheduled, past, cancelled', () => {
  const now = new Date('2026-08-24T20:00:00+03:00')
  const input = [
    { id: 'cancelled', status: 'tuhistatud', start_planned: '2026-08-25T08:00:00+03:00', estimated_total: 0, actual_total: null },
    { id: 'past', status: 'tehtud', start_planned: '2026-08-23T08:00:00+03:00', estimated_total: 0, actual_total: null },
    { id: 'unscheduled', status: 'uus', start_planned: null, planned_date: null, estimated_total: 0, actual_total: null },
    { id: 'future', status: 'kinnitatud', start_planned: '2026-08-25T08:00:00+03:00', estimated_total: 0, actual_total: null },
    { id: 'today-morning', status: 'kinnitatud', start_planned: '2026-08-24T08:00:00+03:00', estimated_total: 0, actual_total: null },
    { id: 'today-evening', status: 'uus', start_planned: '2026-08-24T21:00:00+03:00', estimated_total: 0, actual_total: null },
  ] as any[]
  const result = (dashboardModule as any).allManagerJobs(input, now)
  assert.deepEqual(result.map((job: any) => job.id), ['today-morning', 'today-evening', 'future', 'unscheduled', 'past', 'cancelled'])
})

test('manager dashboard renders each job only in the canonical all-jobs list', () => {
  const source = readFileSync(new URL('../app/manager/page.tsx', import.meta.url), 'utf8')
  assert.equal((source.match(/<JobCard/g) ?? []).length, 1)
  assert.equal(source.includes('<h2>Uued broneeringud</h2>'), false)
  assert.equal(source.includes('<h2>Kontrolli kohe</h2>'), false)
  assert.equal(source.includes('<h2>Tänased tööd</h2>'), false)
})

test('manager jobs are grouped into dated sections with unscheduled and cancelled sections', () => {
  assert.ok('managerJobSections' in dashboardModule, 'managerJobSections must exist')
  const now = new Date('2026-08-24T09:00:00+03:00')
  const input = [
    { id: 'today-1', status: 'uus', start_planned: '2026-08-24T10:00:00+03:00', estimated_total: 0, actual_total: null },
    { id: 'today-2', status: 'kinnitatud', start_planned: '2026-08-24T12:00:00+03:00', estimated_total: 0, actual_total: null },
    { id: 'future', status: 'kinnitatud', start_planned: '2026-09-26T08:00:00+03:00', estimated_total: 0, actual_total: null },
    { id: 'unscheduled', status: 'uus', start_planned: null, planned_date: null, estimated_total: 0, actual_total: null },
    { id: 'past', status: 'tehtud', start_planned: '2026-08-23T08:00:00+03:00', estimated_total: 0, actual_total: null },
    { id: 'cancelled', status: 'tuhistatud', start_planned: '2026-08-24T15:00:00+03:00', estimated_total: 0, actual_total: null },
  ] as any[]
  const sections = (dashboardModule as any).managerJobSections(input, now)
  assert.deepEqual(sections.map((section: any) => ({ key: section.key, ids: section.jobs.map((job: any) => job.id) })), [
    { key: '2026-08-24', ids: ['today-1', 'today-2'] },
    { key: '2026-09-26', ids: ['future'] },
    { key: 'unscheduled', ids: ['unscheduled'] },
    { key: '2026-08-23', ids: ['past'] },
    { key: 'cancelled:2026-08-24', ids: ['cancelled'] },
  ])
})
