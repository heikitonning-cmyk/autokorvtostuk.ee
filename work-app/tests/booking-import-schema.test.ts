import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

test('website bookings have an idempotent external identity', () => {
  const sql = readFileSync(resolve(root, 'supabase/migrations/20260827193000_booking_external_refs.sql'), 'utf8')
  assert.match(sql, /add column if not exists source text/i)
  assert.match(sql, /add column if not exists external_ref text/i)
  assert.match(sql, /create unique index if not exists jobs_source_external_ref_uidx/i)
  assert.match(sql, /on public\.jobs\s*\(source,\s*external_ref\)/i)
  assert.match(sql, /where source is not null and external_ref is not null/i)
})
