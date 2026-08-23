import test from 'node:test'
import assert from 'node:assert/strict'
import * as invitesModule from './invites.ts'

test('invite tokens use deterministic sha256 hashes', () => {
  assert.ok('hashInviteToken' in invitesModule, 'hashInviteToken must exist')
  assert.equal(
    (invitesModule as any).hashInviteToken('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  )
})

test('registration error maps an existing email clearly', () => {
  assert.ok('registrationErrorMessage' in invitesModule, 'registrationErrorMessage must exist')
  const text = (invitesModule as any).registrationErrorMessage('User already registered')
  assert.match(text, /e-postiga kasutaja on juba olemas/i)
})

test('registration error preserves useful auth errors', () => {
  assert.ok('registrationErrorMessage' in invitesModule, 'registrationErrorMessage must exist')
  assert.equal((invitesModule as any).registrationErrorMessage('Password should be at least 6 characters'), 'Password should be at least 6 characters')
})
