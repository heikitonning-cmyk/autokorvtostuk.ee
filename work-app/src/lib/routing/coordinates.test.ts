import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAddress } from './coordinates.ts'

test('address normalization is deterministic for cache keys', () => {
  assert.equal(normalizeAddress('  Pärnu   mnt  10, Tallinn '), 'pärnu mnt 10, tallinn')
  assert.equal(normalizeAddress('PÄRNU MNT 10, TALLINN'), 'pärnu mnt 10, tallinn')
  assert.equal(normalizeAddress('\tLuige,   Estonia\n'), 'luige, estonia')
})
