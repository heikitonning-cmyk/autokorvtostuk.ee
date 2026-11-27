import test from 'node:test'
import assert from 'node:assert/strict'

async function loadModule() {
  try {
    return await import('./customer-sites.ts')
  } catch {
    return {} as Record<string, unknown>
  }
}

test('existing site selection wins when supplied', async () => {
  const mod = await loadModule()
  assert.equal(typeof mod.normalizeSiteChoice, 'function')
  const normalizeSiteChoice = mod.normalizeSiteChoice as (input: any) => any
  assert.deepEqual(normalizeSiteChoice({ siteId: 'site-1', newSiteName: 'Uus', newSiteAddress: 'Test 1' }), {
    siteId: 'site-1',
    newSite: null,
  })
})

test('new site is normalized when no existing site is selected', async () => {
  const mod = await loadModule()
  assert.equal(typeof mod.normalizeSiteChoice, 'function')
  const normalizeSiteChoice = mod.normalizeSiteChoice as (input: any) => any
  assert.deepEqual(normalizeSiteChoice({ siteId: '__new__', newSiteName: ' Uus jaam ', newSiteAddress: ' Test 1 ' }), {
    siteId: null,
    newSite: { name: 'Uus jaam', address: 'Test 1' },
  })
})
