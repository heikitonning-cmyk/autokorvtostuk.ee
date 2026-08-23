import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

test('pending route stops can be removed safely while started stops stay locked', () => {
  const editor = readFileSync(resolve(root, 'src/components/StopOrderEditor.tsx'), 'utf8')
  const wrapper = readFileSync(resolve(root, 'src/components/JobStopsEditor.tsx'), 'utf8')
  const actions = readFileSync(resolve(root, 'src/app/job-stop-actions.ts'), 'utf8')
  const migrationPath = resolve(root, 'supabase/migrations/20260823215000_remove_pending_job_stop.sql')

  assert.equal(existsSync(migrationPath), true, 'stop removal migration must exist')
  const migration = readFileSync(migrationPath, 'utf8')

  assert.match(editor, /onRemove/)
  assert.match(editor, />Eemalda</)
  assert.match(editor, /window\.confirm|confirm\(/)
  assert.match(wrapper, /removeStopAction/)
  assert.match(wrapper, /onRemove=\{removeStop\}/)
  assert.match(actions, /remove_job_stop/)
  assert.match(migration, /create or replace function public\.remove_job_stop/)
  assert.match(migration, /status = 'pending'/)
  assert.match(migration, /route_revision = route_revision \+ 1/)
  assert.match(migration, /'stop_removed'/)
})
