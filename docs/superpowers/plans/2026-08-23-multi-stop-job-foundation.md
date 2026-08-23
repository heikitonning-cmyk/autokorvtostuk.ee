# Multi-Stop Job Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready one-job-many-stops workflow with fast multi-select, manual ordering, stop-level execution, mandatory completion evidence, Waze navigation, and add-stop-during-day support while preserving legacy single-location jobs.

**Architecture:** Keep `jobs` as the workday/job header and add ordered `job_stops` children. All shared planning mutations go through guarded RPC/server actions with optimistic `route_revision`; operational stop start/finish/skip actions remain restricted to the assigned operator. Stop photos reuse `job_photos` with an optional `job_stop_id`.

**Tech Stack:** Next.js 16.3.2, React 19.2.8, TypeScript 7.0.2, Supabase/PostgreSQL 17, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-23-multi-stop-job-routing-design.md`

## Global Constraints

- Work only on branch `app-v1-build`; do not modify `main`.
- One `job` may have zero, one, or many `job_stops`.
- Existing jobs with no stops must continue using the current single-location flow.
- No application-level maximum stop count.
- Duplicate visits to the same `customer_sites.id` in one job are allowed.
- Default route endpoints resolve from `settings.key = 'base_location'` with display label `Luige`; manager/operator may override start/end per job.
- Manager and operator may add/reorder unfinished stops; only the assigned operator may start/finish/skip operational stops.
- `done` requires a non-empty completion note and at least one stop photo.
- `skipped` requires a non-empty completion note; photo is optional.
- A multi-stop job cannot finish while any stop is `pending` or `in_progress`.
- Waze is the navigation target.
- Every implementation task follows TDD: test first, observe RED, implement minimally, observe GREEN, then commit.

---

## File Structure

### Database
- Create `work-app/supabase/migrations/20260823153000_multi_stop_job_foundation.sql` — tables, columns, constraints, indexes, RLS/read policies, base-location setting.
- Create `work-app/supabase/migrations/20260823154000_multi_stop_job_mutations.sql` — guarded add/reorder/endpoint/start/complete/skip RPCs and job-finish guard.
- Modify `work-app/src/lib/security.test.ts` — schema/RPC acceptance tests.

### Domain/query layer
- Create `work-app/src/lib/job-stops.ts` — stop types, search/filter, next-stop selection, Waze URL, terminal-state helpers.
- Create `work-app/src/lib/job-stops.test.ts` — pure unit tests.
- Modify `work-app/src/lib/domain.ts` — exported stop/status types.
- Modify `work-app/src/lib/queries.ts` — fetch stops, stop photos, route endpoints and reference data.

### Planning UI
- Create `work-app/src/components/StopPicker.tsx` — search/filter/multi-select and selected queue.
- Create `work-app/src/components/StopOrderEditor.tsx` — touch-friendly drag reorder for pending stops.
- Create `work-app/src/components/JobStopsEditor.tsx` — compose picker/order/endpoints/add-stop flow.
- Modify `work-app/package.json` and lockfile — add dnd-kit dependencies.
- Modify `work-app/src/app/manager/jobs/new/page.tsx` — allow multi-stop creation.
- Modify `work-app/src/components/JobEditForm.tsx` — expose stop editor for existing multi-stop jobs.
- Modify manager/operator edit pages to pass existing stops and route revision.

### Shared actions
- Create `work-app/src/app/job-stop-actions.ts` — add stops, reorder, update endpoints.
- Modify `work-app/tests/acceptance.test.ts` — source-level UI/route acceptance checks.

### Operational UI
- Create `work-app/src/components/ActiveStopCard.tsx` — current stop, Waze, timer, note, photo, done/skip.
- Modify `work-app/src/components/PhotoUploader.tsx` — optional `jobStopId`.
- Modify `work-app/src/app/api/jobs/[id]/photos/route.ts` — validate/store `job_stop_id`.
- Modify `work-app/src/app/operator/jobs/actions.ts` — stop start/done/skip and multi-stop job finish guard.
- Modify `work-app/src/app/operator/jobs/[id]/page.tsx` — multi-stop operational flow.
- Modify `work-app/src/app/operator/jobs/[id]/finish/page.tsx` — block premature finish and preserve legacy behavior.
- Modify `work-app/src/app/manager/jobs/[id]/page.tsx` — stop list/status/timing/photo summary.

---

### Task 1: Add the multi-stop schema and immutable history snapshots

**Files:**
- Create: `work-app/supabase/migrations/20260823153000_multi_stop_job_foundation.sql`
- Modify: `work-app/src/lib/security.test.ts`

**Interfaces:**
- Produces table `public.job_stops` and `jobs.route_revision`, `jobs.route_start_site_id`, `jobs.route_start_address`, `jobs.route_end_site_id`, `jobs.route_end_address`.
- Produces nullable `job_photos.job_stop_id` while retaining `job_photos.job_id`.
- Produces `settings.key='base_location'` JSON value `{ "label": "Luige", "address": "Luige, Harju maakond, Estonia" }` only when absent.

- [ ] **Step 1: Write the failing schema tests**

Add tests that read the migration and require the exact structural protections:

```ts
const multiStopPath = resolve(here, '../../supabase/migrations/20260823153000_multi_stop_job_foundation.sql')

test('multi-stop schema supports ordered duplicate site visits and stop photos', () => {
  const sql = readFileSync(multiStopPath, 'utf8')
  assert.match(sql, /create table(?: if not exists)? public\.job_stops/i)
  assert.match(sql, /sequence_no\s+integer\s+not null/i)
  assert.match(sql, /status\s+text\s+not null\s+default\s+'pending'/i)
  assert.match(sql, /check\s*\(status\s+in\s*\('pending','in_progress','done','skipped'\)\)/i)
  assert.match(sql, /add column if not exists route_revision bigint not null default 0/i)
  assert.match(sql, /add column if not exists job_stop_id uuid/i)
  assert.match(sql, /unique\s*\(id,\s*job_id\)/i)
  assert.doesNotMatch(sql, /unique\s*\(job_id,\s*site_id\)/i)
  assert.match(sql, /where status = 'in_progress'/i)
  assert.match(sql, /base_location/i)
  assert.match(sql, /Luige/i)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
cd work-app
npm run test:core
```

Expected: FAIL because the migration file and required schema do not exist.

- [ ] **Step 3: Implement the migration**

Create `job_stops` with snapshot fields and status constraint, then add route fields and photo relation. Use the existing private timestamp trigger:

```sql
create table if not exists public.job_stops (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  site_id uuid references public.customer_sites(id),
  sequence_no integer not null,
  name_snapshot text,
  address_snapshot text not null,
  description text,
  status text not null default 'pending' check (status in ('pending','in_progress','done','skipped')),
  actual_start timestamptz,
  actual_end timestamptz,
  completion_note text,
  completed_by uuid references public.users(id),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, job_id),
  unique (job_id, sequence_no)
);

create unique index if not exists job_stops_one_in_progress_per_job
  on public.job_stops(job_id) where status = 'in_progress';

alter table public.jobs
  add column if not exists route_revision bigint not null default 0,
  add column if not exists route_start_site_id uuid references public.customer_sites(id),
  add column if not exists route_start_address text,
  add column if not exists route_end_site_id uuid references public.customer_sites(id),
  add column if not exists route_end_address text;

alter table public.job_photos add column if not exists job_stop_id uuid;
alter table public.job_photos
  add constraint job_photos_stop_same_job_fkey
  foreign key (job_stop_id, job_id) references public.job_stops(id, job_id);
```

Enable RLS on `job_stops`; allow manager/operator reads consistent with current job visibility; do not add broad client update policies. Insert base location only if missing:

```sql
insert into public.settings(key, value)
values ('base_location', '{"label":"Luige","address":"Luige, Harju maakond, Estonia"}'::jsonb)
on conflict (key) do nothing;
```

- [ ] **Step 4: Run tests and verify GREEN**

```bash
cd work-app
npm run test:core
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add work-app/supabase/migrations/20260823153000_multi_stop_job_foundation.sql work-app/src/lib/security.test.ts
git commit -m "feat: add multi-stop job schema"
```

---

### Task 2: Add guarded stop mutations with optimistic route revision

**Files:**
- Create: `work-app/supabase/migrations/20260823154000_multi_stop_job_mutations.sql`
- Modify: `work-app/src/lib/security.test.ts`

**Interfaces:**
- Produces `public.add_job_stops(p_job_id uuid, p_stops jsonb, p_expected_revision bigint) returns bigint`.
- Produces `public.reorder_job_stops(p_job_id uuid, p_stop_ids uuid[], p_expected_revision bigint) returns bigint`.
- Produces `public.update_job_route_endpoints(p_job_id uuid, p_start_site_id uuid, p_start_address text, p_end_site_id uuid, p_end_address text, p_expected_revision bigint) returns bigint`.
- Produces `public.start_job_stop(p_stop_id uuid)`, `public.complete_job_stop(p_stop_id uuid, p_note text)`, `public.skip_job_stop(p_stop_id uuid, p_note text)`.
- All planning RPCs return the incremented `jobs.route_revision`.

- [ ] **Step 1: Write failing security/RPC tests**

```ts
const stopMutationsPath = resolve(here, '../../supabase/migrations/20260823154000_multi_stop_job_mutations.sql')

test('multi-stop mutations guard stale reorders and operator execution', () => {
  const sql = readFileSync(stopMutationsPath, 'utf8')
  assert.match(sql, /create or replace function public\.add_job_stops/i)
  assert.match(sql, /create or replace function public\.reorder_job_stops/i)
  assert.match(sql, /route_revision\s*=\s*route_revision\s*\+\s*1/i)
  assert.match(sql, /route_revision\s*=\s*p_expected_revision/i)
  assert.match(sql, /create or replace function public\.start_job_stop/i)
  assert.match(sql, /operator_id\s*=\s*auth\.uid\(\)/i)
  assert.match(sql, /create or replace function public\.complete_job_stop/i)
  assert.match(sql, /completion_note/i)
  assert.match(sql, /job_photos/i)
  assert.match(sql, /create or replace function public\.skip_job_stop/i)
})
```

- [ ] **Step 2: Run tests and verify RED**

```bash
cd work-app
npm run test:core
```

Expected: FAIL because guarded RPCs are absent.

- [ ] **Step 3: Implement planning RPC guards**

Each planning RPC must:

```sql
if private.current_app_role() not in ('operator','manager') then
  raise exception 'not allowed';
end if;

select route_revision into v_revision
from public.jobs
where id = p_job_id
  and status not in ('tehtud','vajab_jareltegevust','tuhistatud')
for update;

if v_revision is null or v_revision <> p_expected_revision then
  raise exception 'stale route revision';
end if;
```

`reorder_job_stops` validates the supplied IDs are exactly the movable `pending` IDs being reordered, uses a temporary offset to avoid unique sequence collisions, writes final `sequence_no`, increments `route_revision`, and records a `job_events` row.

- [ ] **Step 4: Implement operator-only execution RPCs**

`start_job_stop` verifies the parent job is assigned to `auth.uid()`, no other stop is active, and the target is `pending` before setting `in_progress` and `actual_start=now()`.

`complete_job_stop` verifies trimmed note and a photo count:

```sql
if nullif(btrim(p_note), '') is null then
  raise exception 'completion note required';
end if;

if not exists (
  select 1 from public.job_photos p
  where p.job_id = v_job_id and p.job_stop_id = p_stop_id
) then
  raise exception 'stop photo required';
end if;
```

`skip_job_stop` requires only a non-empty note and permits `pending` or `in_progress`.

- [ ] **Step 5: Run tests and verify GREEN**

```bash
cd work-app
npm run test:core
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add work-app/supabase/migrations/20260823154000_multi_stop_job_mutations.sql work-app/src/lib/security.test.ts
git commit -m "feat: guard multi-stop job mutations"
```

---

### Task 3: Add stop domain helpers and stop-aware queries

**Files:**
- Create: `work-app/src/lib/job-stops.ts`
- Create: `work-app/src/lib/job-stops.test.ts`
- Modify: `work-app/src/lib/domain.ts`
- Modify: `work-app/src/lib/queries.ts`

**Interfaces:**
- Produces `JobStopStatus = 'pending' | 'in_progress' | 'done' | 'skipped'`.
- Produces `filterSites(sites, query, region): SiteOption[]`.
- Produces `nextPendingStop(stops): JobStop | null`.
- Produces `isStopTerminal(status): boolean`.
- Produces `canFinishStops(stops): boolean`.
- Produces `wazeUrl(address): string`.

- [ ] **Step 1: Write failing pure unit tests**

```ts
import { filterSites, nextPendingStop, canFinishStops, wazeUrl } from './job-stops.ts'

test('site search matches name address city and county case-insensitively', () => {
  const sites = [{ id:'1', customer_id:'n', name:'Pirita', address:'Rummu tee 2, Tallinn', city:'Tallinn', county:'Harjumaa' }]
  assert.equal(filterSites(sites, 'rummu', '').length, 1)
  assert.equal(filterSites(sites, 'PIR', '').length, 1)
  assert.equal(filterSites(sites, 'harju', '').length, 1)
})

test('job can finish only when every stop is terminal', () => {
  assert.equal(canFinishStops([{ status:'done' }, { status:'skipped' }] as any), true)
  assert.equal(canFinishStops([{ status:'done' }, { status:'pending' }] as any), false)
})

test('Waze URL encodes the exact stop address', () => {
  assert.equal(wazeUrl('Rummu tee 2, Tallinn'), 'https://www.waze.com/ul?q=Rummu%20tee%202%2C%20Tallinn&navigate=yes')
})
```

- [ ] **Step 2: Run test and verify RED**

```bash
cd work-app
node --experimental-strip-types --test src/lib/job-stops.test.ts
```

Expected: FAIL because `job-stops.ts` does not exist.

- [ ] **Step 3: Implement minimal helpers and types**

```ts
export type JobStopStatus = 'pending' | 'in_progress' | 'done' | 'skipped'

export const isStopTerminal = (status: JobStopStatus) => status === 'done' || status === 'skipped'
export const canFinishStops = (stops: Array<{status: JobStopStatus}>) => stops.length > 0 && stops.every((s) => isStopTerminal(s.status))
export const nextPendingStop = <T extends {status: JobStopStatus; sequence_no: number}>(stops: T[]) =>
  [...stops].sort((a,b) => a.sequence_no - b.sequence_no).find((s) => s.status === 'pending') ?? null
export const wazeUrl = (address: string) => `https://www.waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`
```

`filterSites` normalizes name/address/city/county with Estonian locale and applies optional region equality against city/county.

- [ ] **Step 4: Extend queries**

`getJobDetail` and `getOperatorJob` must select ordered `job_stops` and associate stop photos. Add a dedicated helper:

```ts
export async function getJobStops(jobId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from('job_stops').select('*').eq('job_id', jobId).order('sequence_no')
  if (error) throw error
  return data ?? []
}
```

Also fetch `settings.key='base_location'` for editor defaults.

- [ ] **Step 5: Run full tests, typecheck and verify GREEN**

```bash
cd work-app
npm test
npm run typecheck
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add work-app/src/lib/job-stops.ts work-app/src/lib/job-stops.test.ts work-app/src/lib/domain.ts work-app/src/lib/queries.ts
git commit -m "feat: add job stop domain helpers"
```

---

### Task 4: Build the fast multi-select picker and touch reorder editor

**Files:**
- Modify: `work-app/package.json`
- Modify: `work-app/package-lock.json`
- Create: `work-app/src/components/StopPicker.tsx`
- Create: `work-app/src/components/StopOrderEditor.tsx`
- Create: `work-app/src/components/JobStopsEditor.tsx`
- Modify: `work-app/tests/acceptance.test.ts`

**Interfaces:**
- `StopPicker({ sites, onAdd })` calls `onAdd(selectedSites: SiteOption[])` preserving selected order.
- `StopOrderEditor({ stops, onReorder })` returns only pending-stop IDs in desired order.
- `JobStopsEditor` submits `add_job_stops`, endpoint updates and reorder through shared server actions.

- [ ] **Step 1: Add failing acceptance tests**

Require the source to contain the agreed copy and multi-selection behavior:

```ts
test('multi-stop editor supports search, many selected sites and mobile reorder', () => {
  const picker = readFileSync(resolve(root, 'src/components/StopPicker.tsx'), 'utf8')
  const order = readFileSync(resolve(root, 'src/components/StopOrderEditor.tsx'), 'utf8')
  assert.match(picker, /Otsi nime, aadressi või linna/)
  assert.match(picker, /Valitud/)
  assert.match(picker, /Lisa .* peatust tööle/)
  assert.match(picker, /type="checkbox"/)
  assert.match(order, /DndContext/)
  assert.match(order, /SortableContext/)
})
```

- [ ] **Step 2: Run tests and verify RED**

```bash
cd work-app
npm test
```

Expected: FAIL because components are absent.

- [ ] **Step 3: Add dnd-kit dependencies**

```bash
cd work-app
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 4: Implement `StopPicker`**

Use `filterSites`; keep `selected: SiteOption[]`, not a Set, so the same saved site may be added again after a batch is committed. Filters are derived from actual `city`/`county` values. The submit callback receives the selected list exactly in the displayed order.

- [ ] **Step 5: Implement `StopOrderEditor`**

Use pointer + touch sensors and `arrayMove`:

```tsx
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
)
```

Render terminal stops as fixed rows and only pending stops as sortable items.

- [ ] **Step 6: Compose `JobStopsEditor`**

Expose route start/end text fields, current stop count, `+ Lisa peatus`, picker, and sortable current sequence. Do not add optimization buttons in this plan.

- [ ] **Step 7: Run tests/typecheck/build and verify GREEN**

```bash
cd work-app
npm test
npm run typecheck
npm run build
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add work-app/package.json work-app/package-lock.json work-app/src/components/StopPicker.tsx work-app/src/components/StopOrderEditor.tsx work-app/src/components/JobStopsEditor.tsx work-app/tests/acceptance.test.ts
git commit -m "feat: add multi-stop picker and ordering UI"
```

---

### Task 5: Wire shared planning actions into create/edit flows

**Files:**
- Create: `work-app/src/app/job-stop-actions.ts`
- Modify: `work-app/src/app/manager/jobs/new/page.tsx`
- Modify: `work-app/src/components/JobEditForm.tsx`
- Modify: `work-app/src/app/manager/jobs/[id]/edit/page.tsx`
- Modify: `work-app/src/app/operator/jobs/[id]/edit/page.tsx`
- Modify: `work-app/tests/acceptance.test.ts`

**Interfaces:**
- `addStopsAction(formData)` calls `add_job_stops` with JSON snapshots and current revision.
- `reorderStopsAction(formData)` calls `reorder_job_stops`.
- `updateRouteEndpointsAction(formData)` calls `update_job_route_endpoints`.
- All action failures redirect back with `?error=stale-route` or `?error=save` without mutating local ordering.

- [ ] **Step 1: Write failing acceptance tests**

```ts
test('manager and worker edit flows expose shared multi-stop planning actions', () => {
  const actions = readFileSync(resolve(root, 'src/app/job-stop-actions.ts'), 'utf8')
  assert.match(actions, /add_job_stops/)
  assert.match(actions, /reorder_job_stops/)
  assert.match(actions, /update_job_route_endpoints/)
  const form = readFileSync(resolve(root, 'src/components/JobEditForm.tsx'), 'utf8')
  assert.match(form, /JobStopsEditor/)
})
```

- [ ] **Step 2: Run and verify RED**

```bash
cd work-app
npm test
```

- [ ] **Step 3: Implement server actions**

Parse `expectedRevision` as integer; parse stop JSON as `{siteId,name,address,description}[]`; reject blank addresses before RPC. Map Supabase stale-revision errors to `error=stale-route`.

- [ ] **Step 4: Integrate create/edit pages**

New-job flow creates the job header first, then adds the selected stop batch using revision `0`. Edit flows fetch `job_stops` + `route_revision` and render `JobStopsEditor`. Keep `JobLocationFields` for legacy jobs with zero stops and provide a clear `Lisa peatused` conversion affordance.

- [ ] **Step 5: Run tests/typecheck/build and verify GREEN**

```bash
cd work-app
npm test
npm run typecheck
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add work-app/src/app/job-stop-actions.ts work-app/src/app/manager/jobs/new/page.tsx work-app/src/components/JobEditForm.tsx work-app/src/app/manager/jobs/[id]/edit/page.tsx work-app/src/app/operator/jobs/[id]/edit/page.tsx work-app/tests/acceptance.test.ts
git commit -m "feat: wire multi-stop planning actions"
```

---

### Task 6: Associate photos with stops and enforce stop completion evidence

**Files:**
- Modify: `work-app/src/components/PhotoUploader.tsx`
- Modify: `work-app/src/app/api/jobs/[id]/photos/route.ts`
- Create: `work-app/src/components/ActiveStopCard.tsx`
- Modify: `work-app/src/app/operator/jobs/actions.ts`
- Modify: `work-app/src/app/operator/jobs/[id]/page.tsx`
- Modify: `work-app/tests/acceptance.test.ts`

**Interfaces:**
- `PhotoUploader({ jobId, jobStopId? })` sends `jobStopId` when present.
- Photo API verifies the stop belongs to `jobId` and the job is assigned to the current operator before inserting `job_photos(job_id, job_stop_id, ...)`.
- `ActiveStopCard` submits `startJobStop`, `completeJobStop`, `skipJobStop` actions.

- [ ] **Step 1: Write failing acceptance tests**

```ts
test('operator stop flow requires note and stop photo for done but not skip', () => {
  const card = readFileSync(resolve(root, 'src/components/ActiveStopCard.tsx'), 'utf8')
  const actions = readFileSync(resolve(root, 'src/app/operator/jobs/actions.ts'), 'utf8')
  const uploader = readFileSync(resolve(root, 'src/components/PhotoUploader.tsx'), 'utf8')
  assert.match(card, /Alusta peatust/)
  assert.match(card, /Tehtud/)
  assert.match(card, /Jäta vahele/)
  assert.match(card, /completionNote/)
  assert.match(actions, /start_job_stop/)
  assert.match(actions, /complete_job_stop/)
  assert.match(actions, /skip_job_stop/)
  assert.match(uploader, /jobStopId/)
})
```

- [ ] **Step 2: Run and verify RED**

```bash
cd work-app
npm test
```

- [ ] **Step 3: Extend photo upload**

`PhotoUploader` conditionally adds:

```ts
if (jobStopId) body.set('jobStopId', jobStopId)
```

The API validates `job_stop_id` with a query constrained by both `id` and `job_id`; reject mismatches with HTTP 400/403.

- [ ] **Step 4: Add stop server actions**

Each action requires worker view and calls its guarded RPC. On success, revalidate both operator and manager job detail paths. On validation error, redirect back with stable error codes: `note-required`, `photo-required`, `stop-state`, `not-assigned`.

- [ ] **Step 5: Build `ActiveStopCard`**

For `pending`: show Waze link and `Alusta peatust`. For `in_progress`: show `ElapsedTimer`, stop-scoped `PhotoUploader`, required textarea named `completionNote`, and both terminal actions. For terminal states: render status, elapsed time, note and photo count read-only.

- [ ] **Step 6: Integrate operator page**

If `job_stops.length > 0`, render ordered stop progress and emphasize active stop or `nextPendingStop`. After a terminal action, the page naturally advances to the next pending stop and shows `Navigeeri Waze'is`.

- [ ] **Step 7: Run tests/typecheck/build and verify GREEN**

```bash
cd work-app
npm test
npm run typecheck
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add work-app/src/components/PhotoUploader.tsx work-app/src/app/api/jobs/[id]/photos/route.ts work-app/src/components/ActiveStopCard.tsx work-app/src/app/operator/jobs/actions.ts work-app/src/app/operator/jobs/[id]/page.tsx work-app/tests/acceptance.test.ts
git commit -m "feat: execute and document job stops"
```

---

### Task 7: Add stops during active work and preserve fixed history during reorder

**Files:**
- Modify: `work-app/src/components/JobStopsEditor.tsx`
- Modify: `work-app/src/components/StopOrderEditor.tsx`
- Modify: `work-app/src/app/operator/jobs/[id]/page.tsx`
- Modify: `work-app/src/app/manager/jobs/[id]/page.tsx`
- Modify: `work-app/tests/acceptance.test.ts`

**Interfaces:**
- `+ Lisa peatus` remains available while the parent job is editable.
- New stops append after the current unfinished sequence; terminal rows retain their historical sequence/display position.
- Both roles can reorder only pending rows.

- [ ] **Step 1: Write failing acceptance test**

```ts
test('active multi-stop job can append another stop and reorder pending work', () => {
  const editor = readFileSync(resolve(root, 'src/components/JobStopsEditor.tsx'), 'utf8')
  const operator = readFileSync(resolve(root, 'src/app/operator/jobs/[id]/page.tsx'), 'utf8')
  assert.match(editor, /\+ Lisa peatus/)
  assert.match(operator, /JobStopsEditor/)
  assert.match(operator, /route_revision/)
})
```

- [ ] **Step 2: Run and verify RED**

```bash
cd work-app
npm test
```

- [ ] **Step 3: Implement active editing**

Render a collapsible `JobStopsEditor` beneath the active stop card for both manager and operator planning views. Fixed terminal/current rows are shown but not draggable. New stops are appended by RPC and increment revision.

- [ ] **Step 4: Add stale-order user feedback**

If `?error=stale-route`, render: `Marsruuti muudeti teises vaates. Värskendasin järjekorra — proovi muudatus uuesti.` Do not auto-retry a stale reorder.

- [ ] **Step 5: Run tests/typecheck/build and verify GREEN**

```bash
cd work-app
npm test
npm run typecheck
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add work-app/src/components/JobStopsEditor.tsx work-app/src/components/StopOrderEditor.tsx work-app/src/app/operator/jobs/[id]/page.tsx work-app/src/app/manager/jobs/[id]/page.tsx work-app/tests/acceptance.test.ts
git commit -m "feat: edit remaining stops during active work"
```

---

### Task 8: Gate multi-stop job completion and preserve legacy finish behavior

**Files:**
- Modify: `work-app/src/app/operator/jobs/actions.ts`
- Modify: `work-app/src/app/operator/jobs/[id]/finish/page.tsx`
- Modify: `work-app/src/app/operator/jobs/[id]/page.tsx`
- Modify: `work-app/src/app/manager/jobs/[id]/page.tsx`
- Modify: `work-app/tests/acceptance.test.ts`

**Interfaces:**
- `finishJob` checks stop count first.
- If stop count is zero: use current legacy finish rules unchanged.
- If stop count > 0: reject while any stop is `pending`/`in_progress`; otherwise continue existing job-level finish/pricing flow.

- [ ] **Step 1: Write failing acceptance test**

```ts
test('multi-stop job finish is blocked until all stops are resolved without breaking legacy jobs', () => {
  const actions = readFileSync(resolve(root, 'src/app/operator/jobs/actions.ts'), 'utf8')
  assert.match(actions, /job_stops/)
  assert.match(actions, /pending/)
  assert.match(actions, /in_progress/)
  assert.match(actions, /count/)
})
```

- [ ] **Step 2: Run and verify RED**

```bash
cd work-app
npm test
```

- [ ] **Step 3: Implement finish guard**

Before current completion calculations:

```ts
const { data: stops, error: stopsError } = await supabase
  .from('job_stops')
  .select('status')
  .eq('job_id', id)
if (stopsError) redirect(`/operator/jobs/${id}?error=save`)
if ((stops?.length ?? 0) > 0 && stops!.some((s) => s.status === 'pending' || s.status === 'in_progress')) {
  redirect(`/operator/jobs/${id}?error=stops-open`)
}
```

Do not require job-level photos for multi-stop jobs beyond the existing `completionStatus` behavior without first counting all stop photos as job photos; they already share `job_id`.

- [ ] **Step 4: Render completion summary**

Manager/operator detail pages show total stops, done count, skipped count, stop duration per row and completion note. Preserve the old detail layout when there are no stops.

- [ ] **Step 5: Run full verification**

```bash
cd work-app
npm test
npm run typecheck
npm run build
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add work-app/src/app/operator/jobs/actions.ts work-app/src/app/operator/jobs/[id]/finish/page.tsx work-app/src/app/operator/jobs/[id]/page.tsx work-app/src/app/manager/jobs/[id]/page.tsx work-app/tests/acceptance.test.ts
git commit -m "feat: finish multi-stop jobs safely"
```

---

### Task 9: Production migration and five-stop Neste smoke test

**Files:**
- No new application files unless smoke test exposes a defect.

**Interfaces:**
- Production Supabase receives both migrations in order.
- Vercel deploy must pass CI before live smoke test.

- [ ] **Step 1: Run fresh local/CI-equivalent verification**

```bash
cd work-app
npm test
npm run typecheck
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 2: Apply migrations to production Supabase**

Apply `20260823153000_multi_stop_job_foundation.sql`, then `20260823154000_multi_stop_job_mutations.sql`. Verify `job_stops` exists, duplicate `site_id` rows are permitted, and only one `in_progress` stop per job is enforced.

- [ ] **Step 3: Verify Vercel deployment**

Require the branch-head Vercel status to be `success` before smoke testing.

- [ ] **Step 4: Run a reversible Neste smoke test**

Create or use a test job with at least five saved Neste stations. Verify: multi-search, five selections, manual reorder, Waze link to first stop, start first stop, photo + note then `Tehtud`, note-only `Jäta vahele` on another stop, add another station during the active job, reorder remaining stops, and finish gating.

- [ ] **Step 5: Confirm legacy regression**

Open an existing single-location job with no `job_stops`; verify address navigation, edit, start and finish routes still render and existing acceptance tests remain green.

- [ ] **Step 6: Record completion commit if smoke fixes were needed**

```bash
git add -A
git commit -m "fix: address multi-stop production smoke findings"
```

Skip this commit only if no files changed.
