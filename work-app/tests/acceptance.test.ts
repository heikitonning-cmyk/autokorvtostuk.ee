import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

test('v1 contains the critical manager and operator routes', () => {
  for (const path of [
    'src/app/manager/page.tsx',
    'src/app/manager/jobs/new/page.tsx',
    'src/app/manager/jobs/[id]/edit/page.tsx',
    'src/app/manager/calendar/page.tsx',
    'src/app/manager/customers/page.tsx',
    'src/app/manager/settings/page.tsx',
    'src/app/manager/users/page.tsx',
    'src/app/operator/page.tsx',
    'src/app/operator/calendar/page.tsx',
    'src/app/operator/jobs/[id]/page.tsx',
    'src/app/operator/jobs/[id]/edit/page.tsx',
    'src/app/operator/jobs/[id]/finish/page.tsx',
    'src/app/register/[token]/page.tsx',
  ]) assert.equal(existsSync(resolve(root, path)), true, path)
})

test('new job form exposes separate date and time controls without operator assignment', () => {
  const page = readFileSync(resolve(root, 'src/app/manager/jobs/new/page.tsx'), 'utf8')
  assert.match(page, /name="plannedDate"[^>]*type="date"/)
  assert.match(page, /name="plannedTime"[^>]*type="time"/)
  assert.doesNotMatch(page, /name="operatorId"/)
})

test('manager and worker can open the same edit form for unfinished jobs', () => {
  const managerDetail = readFileSync(resolve(root, 'src/app/manager/jobs/[id]/page.tsx'), 'utf8')
  const workerDetail = readFileSync(resolve(root, 'src/app/operator/jobs/[id]/page.tsx'), 'utf8')
  const managerEdit = readFileSync(resolve(root, 'src/app/manager/jobs/[id]/edit/page.tsx'), 'utf8')
  const workerEdit = readFileSync(resolve(root, 'src/app/operator/jobs/[id]/edit/page.tsx'), 'utf8')
  const form = readFileSync(resolve(root, 'src/components/JobEditForm.tsx'), 'utf8')
  assert.match(managerDetail, /Muuda/)
  assert.match(managerDetail, /\/manager\/jobs\/\$\{job\.id\}\/edit/)
  assert.match(workerDetail, /Muuda/)
  assert.match(workerDetail, /\/operator\/jobs\/\$\{job\.id\}\/edit/)
  assert.match(managerEdit, /JobEditForm/)
  assert.match(workerEdit, /JobEditForm/)
  assert.match(form, /name="plannedDate"[^>]*type="date"/)
  assert.match(form, /name="plannedTime"[^>]*type="time"/)
  assert.match(form, /name="customerId"/)
  assert.match(form, /name="estimatedHours"/)
  assert.match(form, /Salvesta muudatused/)
})

test('job reference data includes customer sites', () => {
  const queries = readFileSync(resolve(root, 'src/lib/queries.ts'), 'utf8')
  assert.match(queries, /customer_sites/)
  assert.match(queries, /sites:/)
  assert.match(queries, /site:customer_sites/)
})

test('worker shared work plan exposes edit for any editable job', () => {
  const page = readFileSync(resolve(root, 'src/app/operator/page.tsx'), 'utf8')
  assert.match(page, /href=\{`\/operator\/jobs\/\$\{job\.id\}\/edit`\}/)
  assert.match(page, />Muuda</)
  assert.match(page, /Hõivatud/)
})

test('worker job controls still support self-service claim and release', () => {
  const card = readFileSync(resolve(root, 'src/components/OperatorJobCard.tsx'), 'utf8')
  assert.match(card, /VÕTA TÖÖ/)
  assert.match(card, /Vabasta töö/)
})

test('worker landing page combines shared lift availability and work plan', () => {
  const page = readFileSync(resolve(root, 'src/app/operator/page.tsx'), 'utf8')
  const shell = readFileSync(resolve(root, 'src/components/AppShell.tsx'), 'utf8')
  const oldCalendar = readFileSync(resolve(root, 'src/app/operator/calendar/page.tsx'), 'utf8')
  assert.match(page, /getSharedLiftCalendar/)
  assert.match(page, /freeCapacityDays/)
  assert.match(page, /Vabad aknad · 7 päeva/)
  assert.match(page, /Tööplaan/)
  assert.match(page, /VÕTA TÖÖ/)
  assert.doesNotMatch(shell, /href="\/operator\/calendar"/)
  assert.match(oldCalendar, /redirect\(['"]\/operator['"]\)/)
})

test('PWA manifest and service worker exist', () => {
  assert.equal(existsSync(resolve(root, 'src/app/manifest.ts')), true)
  assert.equal(existsSync(resolve(root, 'public/sw.js')), true)
  assert.equal(existsSync(resolve(root, 'public/icon.svg')), true)
})

test('service worker never queues or fakes mutation success', () => {
  const sw = readFileSync(resolve(root, 'public/sw.js'), 'utf8')
  assert.match(sw, /request\.method !== 'GET'/)
  assert.doesNotMatch(sw, /POST.*cache\.put/is)
})

test('deployment instructions include Supabase, Vercel and app subdomain', () => {
  const readme = readFileSync(resolve(root, 'README.md'), 'utf8')
  assert.match(readme, /Supabase/i)
  assert.match(readme, /Vercel/i)
  assert.match(readme, /app\.autokorvtostuk\.ee/i)
})
