import test from 'node:test'
import assert from 'node:assert/strict'
import * as completion from './status.ts'
import * as dates from './jobs.ts'
import { managerSummary, jobsWithinDays, allManagerJobs } from './dashboard.ts'

test('manual completion permits the active manager and assigned operator only', () => {
  assert.ok('canMarkJobCompleted' in completion)
  const can = (completion as any).canMarkJobCompleted
  const job = { status: 'kinnitatud', operator_id: 'worker' }
  assert.equal(can({ id: 'manager', role: 'manager', active: true }, job), true)
  assert.equal(can({ id: 'worker', role: 'operator', active: true }, job), true)
  assert.equal(can({ id: 'other', role: 'operator', active: true }, job), false)
  assert.equal(can({ id: 'worker', role: 'operator', active: false }, job), false)
  assert.equal(can(null, job), false)
  for (const status of ['completed', 'tehtud', 'tuhistatud']) {
    assert.equal(can({ id: 'manager', role: 'manager', active: true }, { ...job, status }), false)
  }
})

test('completion dialog defaults use current Tallinn date and minute across UTC midnight', () => {
  assert.ok('completionDefaults' in dates)
  assert.deepEqual((dates as any).completionDefaults(new Date('2026-09-11T22:34:56Z')), { date: '2026-09-12', time: '01:34' })
})

test('backdated completion retains chosen local time in summer and winter', () => {
  assert.ok('parseCompletionTime' in dates)
  const parse = (dates as any).parseCompletionTime
  const now = new Date('2026-09-12T09:00:00Z')
  assert.equal(parse('2026-09-10', '14:25', now), '2026-09-10T11:25:00.000Z')
  assert.equal(parse('2026-01-10', '14:25', now), '2026-01-10T12:25:00.000Z')
  for (const [date, time] of [['', '12:00'], ['2026-02-30', '12:00'], ['2026-09-12', '25:00'], ['2026-03-29', '03:30'], ['2026-09-13', '12:00']]) {
    assert.equal(parse(date, time, now), null)
  }
})

test('dialog default remains valid during both occurrences of the Tallinn rollback hour', () => {
  for (const iso of ['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z']) {
    const now = new Date(iso)
    const defaults = (dates as any).completionDefaults(now)
    assert.equal((dates as any).parseCompletionTime(defaults.date, defaults.time, now), iso)
  }
})

test('overdue includes every unfinished status only after its deadline', () => {
  const now = new Date('2026-09-12T10:00:00Z')
  const jobs = ['uus', 'kinnitatud', 'teel', 'toob', 'completed', 'tehtud', 'vajab_jareltegevust', 'tuhistatud'].map(status => ({ id: status, status, start_planned: '2026-09-12T08:00:00Z', end_planned: '2026-09-12T09:59:00Z', estimated_total: 90, actual_total: null }))
  jobs.push({ ...jobs[0], id: 'not-yet-due', end_planned: '2026-09-12T10:01:00Z' })
  assert.deepEqual(managerSummary(jobs as any[], now).overdueNotStarted.map(j => j.id), ['uus', 'kinnitatud', 'teel', 'toob'])
})

test('date-only deadlines expire at end of the Tallinn day; no date is not overdue', () => {
  const jobs = [
    { id: 'yesterday', status: 'kinnitatud', start_planned: null, planned_date: '2026-09-11' },
    { id: 'today', status: 'kinnitatud', start_planned: null, planned_date: '2026-09-12' },
    { id: 'no-date', status: 'kinnitatud', start_planned: null },
  ]
  assert.deepEqual(managerSummary(jobs as any[], new Date('2026-09-11T21:00:01Z')).overdueNotStarted.map(j => j.id), ['yesterday'])
})

test('completed jobs leave active work but stay in history and revenue on selected completion date', () => {
  assert.ok('isActiveJob' in completion)
  const job = { id: 'backdated', status: 'completed', start_planned: '2026-09-12T08:00:00Z', completed_at: '2026-08-01T09:00:00Z', estimated_total: 120, actual_total: 150 }
  assert.equal((completion as any).isActiveJob(job), false)
  assert.equal((completion as any).isActiveJob({ status: 'tehtud' }), false)
  assert.equal((completion as any).isActiveJob({ status: 'toob' }), true)
  assert.deepEqual(allManagerJobs([job] as any[]).map(j => j.id), ['backdated'])
  assert.equal(jobsWithinDays([job] as any[], 7, new Date('2026-09-12T10:00:00Z')).length, 0)
  assert.equal(jobsWithinDays([job] as any[], 7, new Date('2026-08-02T10:00:00Z')).length, 1)
  assert.equal(managerSummary([job] as any[], new Date('2026-08-01T12:00:00Z')).todayRevenue, 150)
})
