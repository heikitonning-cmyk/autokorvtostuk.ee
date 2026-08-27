import test from 'node:test'
import assert from 'node:assert/strict'
import * as authModule from './auth.ts'

const { homeForRole } = authModule

test('manager lands on manager dashboard', () => {
  assert.equal(homeForRole('manager'), '/manager')
})

test('operator lands on operator today view', () => {
  assert.equal(homeForRole('operator'), '/operator')
})

test('manager can use both manager and worker views', () => {
  assert.ok('canAccessView' in authModule, 'canAccessView must exist')
  assert.equal((authModule as any).canAccessView('manager', 'manager'), true)
  assert.equal((authModule as any).canAccessView('manager', 'worker'), true)
})

test('operator can use only worker view', () => {
  assert.ok('canAccessView' in authModule, 'canAccessView must exist')
  assert.equal((authModule as any).canAccessView('operator', 'worker'), true)
  assert.equal((authModule as any).canAccessView('operator', 'manager'), false)
})
