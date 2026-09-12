import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as dashboardModule from './dashboard.ts'

test('manager all-jobs list keeps every job status including cancelled and unscheduled', () => {
  assert.ok('allManagerJobs' in dashboardModule, 'allManagerJobs must exist')
  const input = [
    { id: 'future', status: 'kinnitatud', start_planned: '2026-09-26T08:00:00+03:00', estimated_total: 1, actual_total: null },
    { id: 'new', status: 'uus', start_planned: '2026-08-25T08:00:00+03:00', estimated_total: 1, actual_total: null },
    { id: 'done', status: 'tehtud', start_planned: '2026-08-20T08:00:00+03:00', estimated_total: 1, actual_total: 1 },
    { id: 'cancelled', status: 'tuhistatud', start_planned: '2026-08-19T08:00:00+03:00', estimated_total: 1, actual_total: null },
    { id: 'unscheduled', status: 'uus', start_planned: null, planned_date: null, estimated_total: null, actual_total: null },
  ] as any[]
  const result = (dashboardModule as any).allManagerJobs(input)
  assert.deepEqual(new Set(result.map((job: any) => job.id)), new Set(input.map((job) => job.id)))
  assert.equal(result.length, input.length)
})

test('manager jobs query is not limited to a rolling date window', () => {
  const source = readFileSync(new URL('./queries.ts', import.meta.url), 'utf8')
  const start = source.indexOf('export async function getManagerJobs()')
  const end = source.indexOf('export async function getCustomerSites()', start)
  const fn = source.slice(start, end)
  assert.doesNotMatch(fn, /35\s*\*\s*86400000/)
  assert.doesNotMatch(fn, /\.gte\('start_planned'/)
  assert.doesNotMatch(fn, /\.lte\('start_planned'/)
})

test('manager can permanently delete a whole job from its detail page', () => {
  const actions = readFileSync(new URL('../app/manager/jobs/actions.ts', import.meta.url), 'utf8')
  const detail = readFileSync(new URL('../app/manager/jobs/[id]/page.tsx', import.meta.url), 'utf8')
  assert.match(actions, /export async function deleteJob\(/)
  assert.match(actions, /requireUser\('manager'\)/)
  assert.match(actions, /from\('jobs'\)\.delete\(\)\.eq\('id', id\)/)
  assert.match(detail, /deleteJob/)
  assert.match(detail, /Kustuta töö jäädavalt/)
})
