import test from 'node:test'
import assert from 'node:assert/strict'
import { operatorJobDate, operatorJobTime, operatorPlanJobs } from './operator-plan.ts'
import { tallinnDate } from './payroll.ts'

const jobs = [
  { id: 'yesterday', status: 'kinnitatud', planned_date: '2026-11-10', planned_time: '09:00' },
  { id: 'tomorrow', status: 'uus', planned_date: '2026-11-12', planned_time: '10:00' },
  { id: 'today-later', status: 'kinnitatud', planned_date: '2026-11-11', planned_time: '14:00' },
  { id: 'today-earlier', status: 'toob', planned_date: '2026-11-11', planned_time: '09:00' },
  { id: 'done', status: 'completed', planned_date: '2026-11-11', planned_time: '08:00' },
  { id: 'cancelled', status: 'tuhistatud', planned_date: '2026-11-12', planned_time: '08:00' },
  { id: 'unscheduled', status: 'uus', planned_date: null, planned_time: null },
]

test('driver default plan hides past dates without requiring completion and orders daily times', () => {
  const visible = operatorPlanJobs(jobs, 'active', '2026-11-11')
  assert.deepEqual(visible.map(j => j.id), ['today-earlier', 'tomorrow', 'today-later', 'unscheduled'])
  assert.deepEqual(jobs.map(j => j.id), ['yesterday', 'tomorrow', 'today-later', 'today-earlier', 'done', 'cancelled', 'unscheduled'])
})

test('history retains old unfinished jobs and completed jobs; calendar still exposes all non-cancelled jobs', () => {
  assert.deepEqual(operatorPlanJobs(jobs, 'history', '2026-11-11').map(j => j.id), ['done', 'yesterday'])
  assert.equal(operatorPlanJobs(jobs, 'calendar', '2026-11-11').length, 6)
  assert.equal(operatorPlanJobs(jobs, 'active', '2026-11-13').length, 1)
})

test('legacy timestamps use the Tallinn date at midnight and summer time boundaries', () => {
  const legacy = { status: 'kinnitatud', start_planned: '2026-11-10T22:30:00Z' }
  const today = tallinnDate(new Date('2026-11-10T22:01:00Z'))
  assert.equal(today, '2026-11-11')
  assert.equal(operatorJobDate(legacy), today)
  assert.equal(operatorPlanJobs([legacy], 'active', today).length, 1)
  assert.equal(operatorPlanJobs([legacy], 'active', '2026-11-12').length, 0)
  assert.equal(operatorJobDate({ status: 'uus', start_planned: '2026-06-10T21:30:00Z' }), '2026-06-11')
})

test('driver cards show start and end times with useful missing-time fallbacks', () => {
  assert.equal(operatorJobTime({ status: 'kinnitatud', planned_time: '09:00:00', planned_end_time: '12:30:00' }), '09:00–12:30')
  assert.equal(operatorJobTime({ status: 'kinnitatud', start_planned: '2026-11-11T07:00:00Z', end_planned: '2026-11-11T10:30:00Z' }), '09:00–12:30')
  assert.equal(operatorJobTime({ status: 'uus', planned_time: '09:00' }), '09:00')
  assert.equal(operatorJobTime({ status: 'uus' }), 'Aeg määramata')
})
