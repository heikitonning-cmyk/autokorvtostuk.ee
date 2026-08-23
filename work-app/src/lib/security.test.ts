import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const initPath = resolve(here, '../../supabase/migrations/20260822190000_init.sql')
const workerPath = resolve(here, '../../supabase/migrations/20260823122000_user_claims_and_invites.sql')
const sharedCalendarPath = resolve(here, '../../supabase/migrations/20260823140500_shared_lift_calendar.sql')
const sharedEditPath = resolve(here, '../../supabase/migrations/20260823143000_shared_unfinished_job_editing.sql')
const customerSitesPath = resolve(here, '../../supabase/migrations/20260823150000_customer_sites_and_neste.sql')

test('schema defines all core tables and enables RLS', () => {
  const sql = readFileSync(initPath, 'utf8')
  for (const table of ['users', 'customers', 'vehicles', 'work_types', 'settings', 'jobs', 'job_photos', 'job_events']) {
    assert.match(sql, new RegExp(`create table(?: if not exists)? public\\.${table}`, 'i'))
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
  }
})

test('worker migration initially exposes free or own jobs', () => {
  const sql = readFileSync(workerPath, 'utf8')
  assert.match(sql, /operator can read free or own jobs/i)
  assert.match(sql, /operator_id\s+is\s+null/i)
  assert.match(sql, /operator_id\s*=\s*auth\.uid\(\)/i)
  assert.match(sql, /status\s*<>\s*'tuhistatud'/i)
})

test('shared lift calendar exposes all non-cancelled bookings without widening job updates', () => {
  const sql = readFileSync(sharedCalendarPath, 'utf8')
  assert.match(sql, /create or replace function public\.shared_lift_calendar/i)
  assert.match(sql, /security definer/i)
  assert.match(sql, /status\s*<>\s*'tuhistatud'/i)
  assert.match(sql, /private\.current_app_role\(\)\s+not in\s+\('operator',\s*'manager'\)/i)
  assert.doesNotMatch(sql, /create policy .*update.*all active lift jobs/i)
})

test('all active users can edit every unfinished non-cancelled job through guarded RPC', () => {
  const sql = readFileSync(sharedEditPath, 'utf8')
  assert.match(sql, /create or replace function public\.update_editable_job/i)
  assert.match(sql, /security definer/i)
  assert.match(sql, /private\.current_app_role\(\)\s+not in\s+\('operator',\s*'manager'\)/i)
  assert.match(sql, /status\s+not in\s+\('tehtud',\s*'vajab_jareltegevust',\s*'tuhistatud'\)/i)
  assert.match(sql, /operator can read all non-cancelled jobs/i)
  assert.match(sql, /operator can read all customers/i)
  assert.match(sql, /price_snapshot_json/i)
  assert.match(sql, /settings/i)
  assert.doesNotMatch(sql, /set\s+operator_id\s*=/i)
})

test('customer sites migration adds reusable sites and 59 Neste stations', () => {
  const sql = readFileSync(customerSitesPath, 'utf8')
  assert.match(sql, /create table if not exists public\.customer_sites/i)
  assert.match(sql, /add column if not exists site_id uuid references public\.customer_sites\(id\)/i)
  assert.match(sql, /customer_sites_customer_external_code_uq/i)
  assert.match(sql, /manager can manage customer sites/i)
  assert.match(sql, /operator can read customer sites/i)
  assert.match(sql, /operator can add manual customer sites/i)
  assert.match(sql, /NESTE-001/)
  assert.match(sql, /NESTE-059/)
  assert.match(sql, /on conflict \(customer_id, external_code\)/i)
})

test('customer site migration extends guarded job editing without changing ownership', () => {
  const sql = readFileSync(customerSitesPath, 'utf8')
  assert.match(sql, /p_site_id\s+uuid/i)
  assert.match(sql, /site_id\s*=\s*p_site_id/i)
  assert.match(sql, /status\s+not in\s+\('tehtud',\s*'vajab_jareltegevust',\s*'tuhistatud'\)/i)
  assert.doesNotMatch(sql, /operator_id\s*=\s*p_/i)
})

test('worker migration defines atomic claim and guarded release functions', () => {
  const sql = readFileSync(workerPath, 'utf8')
  assert.match(sql, /create or replace function public\.claim_job/i)
  assert.match(sql, /operator_id\s+is\s+null/i)
  assert.match(sql, /returning\s+id/i)
  assert.match(sql, /create or replace function public\.release_job/i)
  assert.match(sql, /actual_start\s+is\s+null/i)
  assert.match(sql, /operator_id\s*=\s*auth\.uid\(\)/i)
})

test('worker invites are hashed one-time operator invites', () => {
  const sql = readFileSync(workerPath, 'utf8')
  assert.match(sql, /create table(?: if not exists)? public\.user_invites/i)
  assert.match(sql, /token_hash\s+text\s+(?:unique\s+)?not null/i)
  assert.match(sql, /role\s+text\s+not null\s+default\s+'operator'/i)
  assert.match(sql, /expires_at\s+timestamptz\s+not null/i)
  assert.match(sql, /used_at\s+timestamptz/i)
  assert.match(sql, /revoked_at\s+timestamptz/i)
  assert.match(sql, /create or replace function public\.validate_user_invite/i)
})

test('invite signup trigger always creates operator profile', () => {
  const sql = readFileSync(workerPath, 'utf8')
  assert.match(sql, /app_registration/i)
  assert.match(sql, /worker_invite/i)
  assert.match(sql, /insert into public\.users/i)
  assert.match(sql, /'operator'/i)
  assert.match(sql, /create trigger .*auth.*user|create trigger .*worker.*invite/i)
})

test('job photos bucket is private and policies bind photos to assigned jobs', () => {
  const sql = readFileSync(initPath, 'utf8')
  assert.match(sql, /'job-photos'\s*,\s*'job-photos'\s*,\s*false/i)
  assert.match(sql, /operator can manage assigned job photos/i)
})

test('audit trigger exists for jobs and settings', () => {
  const sql = readFileSync(initPath, 'utf8')
  assert.match(sql, /create trigger jobs_audit_trigger/i)
  assert.match(sql, /create trigger settings_audit_trigger/i)
})
