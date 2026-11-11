# Multi-Stop Foundation Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining approved multi-stop requirements before production: one-off manual stops, reorder-before-add, selectable/manual route endpoints, per-stop short descriptions, parent-job execution guards, and audited manager corrections.

**Architecture:** This plan supplements `2026-08-23-multi-stop-job-foundation.md` and must run after its Task 8 but before its production Task 9. It extends the same `job_stops`, `route_revision`, guarded RPC and component boundaries rather than adding another subsystem.

**Tech Stack:** Next.js 16.3.2, React 19.2.8, TypeScript 7.0.2, Supabase/PostgreSQL 17, dnd-kit, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-23-multi-stop-job-routing-design.md`

**Prerequisite:** `docs/superpowers/plans/2026-08-23-multi-stop-job-foundation.md` Tasks 1–8.

## Global Constraints

- Work only on `app-v1-build`; do not modify `main`.
- Do not run the foundation plan's production Task 9 until Tasks 1–4 below are complete and verified.
- One-off/manual stops may have `site_id = null` but must have a non-empty address snapshot.
- Selecting a saved route endpoint derives the stored route address server-side from that saved site; manual endpoint input stores `site_id = null`.
- Manager/operator may edit a pending stop's short work description; terminal stop corrections are manager-only and audited.
- Starting a stop requires the parent job to be assigned to the caller and already in active `toob` state with `actual_start` set.
- Every mutation that changes future route state increments `jobs.route_revision`.
- Every task uses TDD: failing test, observed RED, minimal implementation, observed GREEN, commit.

---

### Task 1: Support one-off stops and reorder the selected batch before insertion

**Files:**
- Modify: `work-app/src/components/StopPicker.tsx`
- Modify: `work-app/src/components/JobStopsEditor.tsx`
- Modify: `work-app/src/app/job-stop-actions.ts`
- Modify: `work-app/supabase/migrations/20260823154000_multi_stop_job_mutations.sql`
- Modify: `work-app/tests/acceptance.test.ts`
- Modify: `work-app/src/lib/security.test.ts`

**Interfaces:**
- Selected draft stop shape is `{ key: string; siteId: string | null; name: string; address: string; description: string }`.
- `StopPicker` permits a manual draft through `+ Lisa muu aadress`.
- The `Valitud N` draft queue is sortable before insertion.
- `add_job_stops` permits `siteId=null`; when `siteId` is present it validates that the saved site belongs to the parent job's selected customer and derives `name_snapshot`/`address_snapshot` from master data.

- [ ] **Step 1: Add failing acceptance/security tests**

```ts
test('stop picker can add a one-off address and reorder selected drafts before saving', () => {
  const picker = readFileSync(resolve(root, 'src/components/StopPicker.tsx'), 'utf8')
  assert.match(picker, /\+ Lisa muu aadress/)
  assert.match(picker, /manualAddress/)
  assert.match(picker, /Valitud/)
  assert.match(picker, /arrayMove|SortableContext/)
})
```

Add to the mutation migration test:

```ts
assert.match(sql, /site_id/i)
assert.match(sql, /address_snapshot/i)
assert.match(sql, /customer_sites/i)
assert.match(sql, /siteId|site_id/i)
```

- [ ] **Step 2: Run tests and verify RED**

```bash
cd work-app
npm test
```

Expected: FAIL because manual stop entry and selected-batch sorting are absent.

- [ ] **Step 3: Implement manual draft entry**

In `StopPicker`, add local fields `manualName`, `manualAddress`, `manualDescription`. `+ Lisa muu aadress` opens the fields. Adding a manual draft requires `manualAddress.trim()` and pushes:

```ts
{
  key: crypto.randomUUID(),
  siteId: null,
  name: manualName.trim() || manualAddress.trim(),
  address: manualAddress.trim(),
  description: manualDescription.trim(),
}
```

- [ ] **Step 4: Make the selected draft queue sortable**

Wrap selected drafts in a `SortableContext`. Use each draft's `key`, not `siteId`, so duplicate visits to the same saved station remain independently sortable. On drag end use `arrayMove` and preserve that exact order when building `initialStopsJson` or `addStopsAction` payload.

- [ ] **Step 5: Harden `add_job_stops`**

For each JSON item:
- if `siteId` is null: require `address` non-empty and use supplied snapshot name/address/description;
- if `siteId` is non-null: query `customer_sites` and require it belongs to the job's `customer_id`; derive saved name/address from that row rather than trusting client text;
- append each stop at `max(sequence_no)+1` in JSON array order;
- allow the same `siteId` repeatedly.

- [ ] **Step 6: Run tests/typecheck/build and verify GREEN**

```bash
cd work-app
npm test
npm run typecheck
npm run build
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add work-app/src/components/StopPicker.tsx work-app/src/components/JobStopsEditor.tsx work-app/src/app/job-stop-actions.ts work-app/supabase/migrations/20260823154000_multi_stop_job_mutations.sql work-app/tests/acceptance.test.ts work-app/src/lib/security.test.ts
git commit -m "feat: add flexible stop drafting"
```

---

### Task 2: Add saved-location or manual route endpoint controls

**Files:**
- Create: `work-app/src/components/RouteEndpointFields.tsx`
- Modify: `work-app/src/components/JobStopsEditor.tsx`
- Modify: `work-app/src/app/job-stop-actions.ts`
- Modify: `work-app/supabase/migrations/20260823154000_multi_stop_job_mutations.sql`
- Modify: `work-app/tests/acceptance.test.ts`
- Modify: `work-app/src/lib/security.test.ts`

**Interfaces:**
- `RouteEndpointFields` renders start and end controls with default `Luige`, current customer's saved sites, and `Muu aadress`.
- Form submits `routeStartSiteId`, `routeStartAddress`, `routeEndSiteId`, `routeEndAddress`.
- `update_job_route_endpoints` derives saved-site addresses server-side; manual address means corresponding site ID is null.

- [ ] **Step 1: Write failing UI/security tests**

```ts
test('route endpoints can use Luige, saved customer sites or a manual address', () => {
  const component = readFileSync(resolve(root, 'src/components/RouteEndpointFields.tsx'), 'utf8')
  assert.match(component, /Luige/)
  assert.match(component, /Muu aadress/)
  assert.match(component, /routeStartSiteId/)
  assert.match(component, /routeEndSiteId/)
})
```

Mutation test requires:

```ts
assert.match(sql, /update_job_route_endpoints/i)
assert.match(sql, /customer_sites/i)
assert.match(sql, /p_start_site_id/i)
assert.match(sql, /p_end_site_id/i)
```

- [ ] **Step 2: Run tests and verify RED**

```bash
cd work-app
npm test
```

- [ ] **Step 3: Implement endpoint UI**

For each endpoint, select choices:
- `__base__` → display Luige and leave job override fields null;
- saved customer site ID → site selector;
- `__manual__` → show manual address input.

Selecting a saved site previews its address. The current customer's active saved sites are sufficient for the selector because arbitrary external starts/ends are covered by manual address entry.

- [ ] **Step 4: Harden endpoint RPC**

Inside `update_job_route_endpoints`:

```sql
if p_start_site_id is not null then
  select address into v_start_address
  from public.customer_sites
  where id = p_start_site_id and active = true;
  if v_start_address is null then raise exception 'invalid start site'; end if;
else
  v_start_address := nullif(btrim(p_start_address), '');
end if;
```

Repeat for end site. Store site ID + derived address for saved choices; store null site ID + supplied text for manual choices. The base/default choice stores both override columns null so the app resolves `settings.base_location` dynamically.

- [ ] **Step 5: Run tests/typecheck/build and verify GREEN**

```bash
cd work-app
npm test
npm run typecheck
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add work-app/src/components/RouteEndpointFields.tsx work-app/src/components/JobStopsEditor.tsx work-app/src/app/job-stop-actions.ts work-app/supabase/migrations/20260823154000_multi_stop_job_mutations.sql work-app/tests/acceptance.test.ts work-app/src/lib/security.test.ts
git commit -m "feat: add flexible route endpoints"
```

---

### Task 3: Edit stop-specific work descriptions and enforce parent active state

**Files:**
- Modify: `work-app/supabase/migrations/20260823154000_multi_stop_job_mutations.sql`
- Modify: `work-app/src/app/job-stop-actions.ts`
- Modify: `work-app/src/components/StopOrderEditor.tsx`
- Modify: `work-app/src/components/ActiveStopCard.tsx`
- Modify: `work-app/src/lib/security.test.ts`
- Modify: `work-app/tests/acceptance.test.ts`

**Interfaces:**
- Produces `public.update_job_stop_description(p_stop_id uuid, p_description text, p_expected_revision bigint) returns bigint`.
- Produces server action `updateStopDescriptionAction(formData)`.
- Pending stop rows expose optional field label `Peatuse töö`.
- `start_job_stop` requires parent `jobs.status='toob'`, `actual_start is not null`, and `operator_id=auth.uid()`.

- [ ] **Step 1: Write failing tests**

```ts
test('pending stop has an optional stop-specific work description editor', () => {
  const order = readFileSync(resolve(root, 'src/components/StopOrderEditor.tsx'), 'utf8')
  const actions = readFileSync(resolve(root, 'src/app/job-stop-actions.ts'), 'utf8')
  assert.match(order, /Peatuse töö/)
  assert.match(actions, /update_job_stop_description/)
})
```

Security test:

```ts
assert.match(sql, /update_job_stop_description/i)
assert.match(sql, /status\s*=\s*'toob'/i)
assert.match(sql, /actual_start\s+is\s+not\s+null/i)
```

- [ ] **Step 2: Run and verify RED**

```bash
cd work-app
npm test
```

- [ ] **Step 3: Add guarded description RPC/action**

`update_job_stop_description`:
- manager/operator active role;
- parent job editable;
- target stop must be `pending`;
- expected route revision must match;
- set `description = nullif(btrim(p_description),'')`;
- increment `route_revision`;
- insert event `stop_description_changed` with `stop_id`, old/new text and revision.

- [ ] **Step 4: Add the description editor**

Render `Peatuse töö` on pending rows. Save explicitly with a compact `Salvesta` action; do not save on each keystroke. `ActiveStopCard` displays the description read-only above the completion controls.

- [ ] **Step 5: Tighten stop start guard**

`start_job_stop` joins/locks the parent job and accepts the transition only when:

```sql
j.operator_id = auth.uid()
and j.status = 'toob'
and j.actual_start is not null
and s.status = 'pending'
```

This preserves the existing parent-level `ALUSTA TÖÖD` action as the beginning of the workday.

- [ ] **Step 6: Run tests/typecheck/build and verify GREEN**

```bash
cd work-app
npm test
npm run typecheck
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add work-app/supabase/migrations/20260823154000_multi_stop_job_mutations.sql work-app/src/app/job-stop-actions.ts work-app/src/components/StopOrderEditor.tsx work-app/src/components/ActiveStopCard.tsx work-app/src/lib/security.test.ts work-app/tests/acceptance.test.ts
git commit -m "feat: add stop descriptions and execution guard"
```

---

### Task 4: Add manager-only audited corrections for terminal stops

**Files:**
- Modify: `work-app/supabase/migrations/20260823154000_multi_stop_job_mutations.sql`
- Create: `work-app/src/components/StopCorrectionForm.tsx`
- Modify: `work-app/src/app/job-stop-actions.ts`
- Modify: `work-app/src/app/manager/jobs/[id]/page.tsx`
- Modify: `work-app/src/lib/security.test.ts`
- Modify: `work-app/tests/acceptance.test.ts`

**Interfaces:**
- Produces `public.correct_job_stop(p_stop_id uuid, p_actual_start timestamptz, p_actual_end timestamptz, p_completion_note text) returns void`.
- Manager detail exposes `Paranda` only for `done`/`skipped` stops.
- Operator UI never exposes correction action.

- [ ] **Step 1: Write failing tests**

```ts
test('manager can correct terminal stop timing and note through a dedicated form', () => {
  const form = readFileSync(resolve(root, 'src/components/StopCorrectionForm.tsx'), 'utf8')
  const manager = readFileSync(resolve(root, 'src/app/manager/jobs/[id]/page.tsx'), 'utf8')
  const operator = readFileSync(resolve(root, 'src/app/operator/jobs/[id]/page.tsx'), 'utf8')
  assert.match(form, /Paranda/)
  assert.match(form, /actualStart/)
  assert.match(form, /actualEnd/)
  assert.match(form, /completionNote/)
  assert.match(manager, /StopCorrectionForm/)
  assert.doesNotMatch(operator, /StopCorrectionForm/)
})
```

Security test:

```ts
assert.match(sql, /correct_job_stop/i)
assert.match(sql, /private\.current_app_role\(\).*manager/is)
assert.match(sql, /stop_corrected/i)
```

- [ ] **Step 2: Run and verify RED**

```bash
cd work-app
npm test
```

- [ ] **Step 3: Implement manager-only correction RPC**

`correct_job_stop` must:
- require `private.current_app_role()='manager'`;
- lock the stop and parent job;
- require stop status in `('done','skipped')`;
- require non-empty correction note because terminal stops always require a note;
- if both timestamps are non-null, require `p_actual_end >= p_actual_start`;
- update only `actual_start`, `actual_end`, `completion_note`;
- insert `job_events` event `stop_corrected` containing stop ID and old/new values;
- not change route order or terminal status.

- [ ] **Step 4: Implement server action/form**

`StopCorrectionForm` uses `datetime-local` values rendered in Tallinn time, posts `stopId`, `actualStart`, `actualEnd`, `completionNote`, and revalidates manager detail on success. Use stable validation message `Lõppaeg ei saa olla algusajast varasem.` when applicable.

- [ ] **Step 5: Run tests/typecheck/build and verify GREEN**

```bash
cd work-app
npm test
npm run typecheck
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add work-app/supabase/migrations/20260823154000_multi_stop_job_mutations.sql work-app/src/components/StopCorrectionForm.tsx work-app/src/app/job-stop-actions.ts work-app/src/app/manager/jobs/[id]/page.tsx work-app/src/lib/security.test.ts work-app/tests/acceptance.test.ts
git commit -m "feat: audit manager stop corrections"
```

---

### Task 5: Run the foundation production gate after completeness changes

**Files:**
- No planned application file changes.

**Interfaces:**
- This task replaces the timing of the original foundation Plan Task 9: execute that production migration/smoke procedure now, after Tasks 1–4 above.

- [ ] **Step 1: Run fresh full verification**

```bash
cd work-app
npm test
npm run typecheck
npm run build
```

Expected: all PASS / exit 0.

- [ ] **Step 2: Review both migration files as one release**

Confirm the foundation and mutation migrations now include one-off stops, endpoint derivation, stop description edit, parent-active start guard, corrections, route revision, and audited events before applying either migration to production.

- [ ] **Step 3: Apply migrations in order and verify schema/RPCs**

Apply `20260823153000_multi_stop_job_foundation.sql`, then final `20260823154000_multi_stop_job_mutations.sql`. Query `job_stops`, route columns, RPC definitions, RLS and `base_location` afterward.

- [ ] **Step 4: Run the full Neste smoke scenario**

Use at least five saved stations plus one one-off address. Verify: search/multi-select, selected-batch reorder, duplicate station occurrence, saved/manual endpoints, parent job start, per-stop start, description, Waze, done with note+photo, skip with note/no photo, add a stop during the day, pending reorder, manager terminal correction, finish gate, and legacy single-location regression.

- [ ] **Step 5: Only claim foundation complete after fresh CI/Vercel evidence**

Require branch-head CI test/typecheck/build and Vercel combined status `success`. If smoke fixes changed files, repeat Step 1 and redeploy before completion claim.
