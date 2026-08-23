import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

test('routing coordinate cache is persisted and only exposed through guarded RPCs', () => {
  const sql = readFileSync(resolve(root, 'supabase/migrations/20260823164000_routing_coordinates_cache.sql'), 'utf8')
  assert.match(sql, /create table public\.geocode_cache/i)
  assert.match(sql, /normalized_address text primary key/i)
  assert.match(sql, /latitude double precision/i)
  assert.match(sql, /longitude double precision/i)
  assert.match(sql, /get_cached_geocode/i)
  assert.match(sql, /save_geocode_result/i)
  assert.match(sql, /private\.current_app_role\(\)[\s\S]*operator[\s\S]*manager|private\.current_app_role\(\)[\s\S]*manager[\s\S]*operator/i)
  assert.match(sql, /enable row level security/i)
  assert.match(sql, /revoke all on table public\.geocode_cache from public/i)
  assert.match(sql, /geocode_address_snapshot/i)
  assert.match(sql, /latitude_snapshot/i)
  assert.match(sql, /longitude_snapshot/i)
  assert.match(sql, /before update of address on public\.customer_sites/i)
  assert.match(sql, /add_job_stops/i)
})
