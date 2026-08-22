import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const migrationPath = resolve(here, '../../supabase/migrations/20260822190000_init.sql')

test('schema defines all core tables and enables RLS', () => {
  const sql = readFileSync(migrationPath, 'utf8')
  for (const table of ['users', 'customers', 'vehicles', 'work_types', 'settings', 'jobs', 'job_photos', 'job_events']) {
    assert.match(sql, new RegExp(`create table(?: if not exists)? public\\.${table}`, 'i'))
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
  }
})

test('operator job policy is constrained to auth.uid assignment', () => {
  const sql = readFileSync(migrationPath, 'utf8')
  assert.match(sql, /operator can read assigned jobs/i)
  assert.match(sql, /operator_id\s*=\s*auth\.uid\(\)/i)
})

test('job photos bucket is private and policies bind photos to assigned jobs', () => {
  const sql = readFileSync(migrationPath, 'utf8')
  assert.match(sql, /'job-photos'\s*,\s*'job-photos'\s*,\s*false/i)
  assert.match(sql, /operator can manage assigned job photos/i)
})

test('audit trigger exists for jobs and settings', () => {
  const sql = readFileSync(migrationPath, 'utf8')
  assert.match(sql, /create trigger jobs_audit_trigger/i)
  assert.match(sql, /create trigger settings_audit_trigger/i)
})
