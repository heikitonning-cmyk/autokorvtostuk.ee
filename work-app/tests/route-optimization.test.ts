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

test('optimization UI is explicit and preserves manual control', () => {
  const panel = readFileSync(resolve(root, 'src/components/RouteOptimizationPanel.tsx'), 'utf8')
  const editor = readFileSync(resolve(root, 'src/components/JobStopsEditor.tsx'), 'utf8')
  const operator = readFileSync(resolve(root, 'src/app/operator/jobs/[id]/page.tsx'), 'utf8')
  const manager = readFileSync(resolve(root, 'src/app/manager/jobs/[id]/page.tsx'), 'utf8')
  assert.match(panel, /Optimeeri marsruut/)
  assert.match(panel, /Optimeeri ülejäänud marsruut/)
  assert.match(panel, /Kasuta soovitust/)
  assert.match(panel, /Jäta praegune järjekord/)
  assert.match(panel, /Praegune/)
  assert.match(panel, /Soovitus/)
  assert.doesNotMatch(panel, /useEffect[\s\S]*proposeRouteOptimization/)
  assert.match(editor, /RouteOptimizationPanel/)
  assert.match(operator, /RouteOptimizationPanel/)
  assert.match(manager, /RouteOptimizationPanel/)
})
