import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

test('legacy stop tools remain available in code while compact pages omit them', () => {
  const editor = readFileSync(resolve(root, 'src/components/JobStopsEditor.tsx'), 'utf8')
  const details = readFileSync(resolve(root, 'src/components/SimpleJobDetails.tsx'), 'utf8')
  assert.match(editor, /\+ Lisa peatus/)
  assert.match(details, /Lisa-aadressid/)
  assert.doesNotMatch(details, /JobStopsEditor|ActiveStopCard/)
})

test('route endpoints can use Luige, saved customer sites or a manual address', () => {
  const component = readFileSync(resolve(root, 'src/components/RouteEndpointFields.tsx'), 'utf8')
  assert.match(component, /Luige/)
  assert.match(component, /Muu aadress/)
  assert.match(component, /routeStartSiteId/)
  assert.match(component, /routeEndSiteId/)
})

test('pending stop has an optional stop-specific work description editor', () => {
  const order = readFileSync(resolve(root, 'src/components/StopOrderEditor.tsx'), 'utf8')
  const actions = readFileSync(resolve(root, 'src/app/job-stop-actions.ts'), 'utf8')
  assert.match(order, /Peatuse töö/)
  assert.match(actions, /update_job_stop_description/)
})

test('legacy stop correction implementation is preserved but hidden from compact views', () => {
  const form = readFileSync(resolve(root, 'src/components/StopCorrectionForm.tsx'), 'utf8')
  const manager = readFileSync(resolve(root, 'src/app/manager/jobs/[id]/page.tsx'), 'utf8')
  const operator = readFileSync(resolve(root, 'src/app/operator/jobs/[id]/page.tsx'), 'utf8')
  assert.match(form, /Paranda/)
  assert.match(form, /actualStart/)
  assert.match(form, /actualEnd/)
  assert.match(form, /completionNote/)
  assert.doesNotMatch(manager, /StopCorrectionForm/)
  assert.doesNotMatch(operator, /StopCorrectionForm/)
})
