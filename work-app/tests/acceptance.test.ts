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

test('worker landing page offers self-service claim and release', () => {
  const page = readFileSync(resolve(root, 'src/app/operator/page.tsx'), 'utf8')
  const card = readFileSync(resolve(root, 'src/components/OperatorJobCard.tsx'), 'utf8')
  assert.match(page, /Vabad tööd/)
  assert.match(page, /Minu tööd/)
  assert.match(card, /VÕTA TÖÖ/)
  assert.match(card, /Vabasta töö/)
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
