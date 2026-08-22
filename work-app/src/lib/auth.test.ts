import test from 'node:test'
import assert from 'node:assert/strict'
import { homeForRole } from './auth.ts'

test('manager lands on manager dashboard', () => {
  assert.equal(homeForRole('manager'), '/manager')
})

test('operator lands on operator today view', () => {
  assert.equal(homeForRole('operator'), '/operator')
})
