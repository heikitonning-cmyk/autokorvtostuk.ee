import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

test('route optimization is proposal-only until user applies it', () => {
  const actions = readFileSync(resolve(root, 'src/app/route-optimization-actions.ts'), 'utf8')
  assert.match(actions, /proposeRouteOptimization/)
  assert.match(actions, /applyRouteProposal/)
  assert.match(actions, /reorder_job_stops/)
  assert.match(actions, /routing-not-configured/)
  assert.match(actions, /nothing-to-optimize/)
  const proposalSection = actions.split('export async function applyRouteProposal')[0]
  assert.doesNotMatch(proposalSection, /reorder_job_stops/)
})
