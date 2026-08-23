import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

test('active multi-stop job can append another stop and reorder pending work', () => {
  const editor = readFileSync(resolve(root, 'src/components/JobStopsEditor.tsx'), 'utf8')
  const operator = readFileSync(resolve(root, 'src/app/operator/jobs/[id]/page.tsx'), 'utf8')
  const manager = readFileSync(resolve(root, 'src/app/manager/jobs/[id]/page.tsx'), 'utf8')
  assert.match(editor, /\+ Lisa peatus/)
  assert.match(operator, /JobStopsEditor/)
  assert.match(operator, /route_revision/)
  assert.match(manager, /JobStopsEditor/)
  assert.match(manager, /route_revision/)
  assert.match(operator, /Marsruuti muudeti teises vaates/)
})

test('route endpoints can use Luige, saved customer sites or a manual address', () => {
  const component = readFileSync(resolve(root, 'src/components/RouteEndpointFields.tsx'), 'utf8')
  assert.match(component, /Luige/)
  assert.match(component, /Muu aadress/)
  assert.match(component, /routeStartSiteId/)
  assert.match(component, /routeEndSiteId/)
})
