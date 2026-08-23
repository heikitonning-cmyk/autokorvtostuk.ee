import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

test('v1 contains the critical manager and operator routes', () => {
  for (const path of [
    'src/app/manager/page.tsx',
    'src/app/manager/jobs/new/page.tsx',
    'src/app/manager/calendar/page.tsx',
    'src/app/manager/customers/page.tsx',
    'src/app/manager/settings/page.tsx',
    'src/app/manager/users/page.tsx',
    'src/app/operator/page.tsx',
    'src/app/operator/calendar/page.tsx',
    'src/app/operator/jobs/[id]/page.tsx',
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
