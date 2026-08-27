import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

test('website booking upsert RPC is idempotent and preserves the AT reference', () => {
  const sql = readFileSync(resolve(root, 'supabase/migrations/20260827201500_upsert_website_booking.sql'), 'utf8')
  assert.match(sql, /create or replace function public\.upsert_website_booking/i)
  assert.match(sql, /p_external_ref text/i)
  assert.match(sql, /upper\(btrim\(p_external_ref\)\)/i)
  assert.match(sql, /AT-\\d\+/i)
  assert.match(sql, /insert into public\.jobs/i)
  assert.match(sql, /source[\s\S]*'website'/i)
  assert.match(sql, /on conflict \(source, external_ref\)/i)
  assert.match(sql, /do update set/i)
  assert.match(sql, /status = 'kinnitatud'/i)
  assert.match(sql, /security definer/i)
  assert.match(sql, /set search_path = pg_catalog, public/i)
})
