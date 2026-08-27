# Customer Sites + Neste Release A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable customer locations to the work app, import the existing 59 Neste stations under the existing `Neste` customer, and let job creation/editing select or create a customer location while keeping the job address as an immutable-at-that-time snapshot.

**Architecture:** Add `customer_sites` as a first-class child entity of `customers`, and a nullable `jobs.site_id` reference. Job forms use one shared client component for Customer → Site → Object/Address selection. Existing jobs remain valid without a site. Neste source data is seeded idempotently by `external_code` so reruns update the same 59 stations instead of creating duplicates.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/Postgres/RLS, Node built-in test runner, GitHub Actions/Vercel.

**Spec:** `docs/superpowers/specs/2026-08-23-workflow-platform-design.md`

## Global Constraints

- Keep branch `app-v1-build`; do not modify `main`.
- Existing jobs with `site_id = null` must continue to work.
- All job fields remain optional unless an existing database invariant already requires otherwise.
- Selecting a site copies its current name/address into the job; changing a site later must not rewrite historical job snapshots.
- Existing customer `Neste` is reused; do not create a duplicate if it already exists.
- Neste import is idempotent by `(customer_id, external_code)`.
- Managers can manage sites; active operators can read all sites and add a missing manual site from an editable job flow, but cannot delete site master data.
- Completed, follow-up-required, and cancelled jobs remain non-editable.
- Keep the existing single-lift calendar, claim/release, audit, pricing-snapshot, and role behavior intact.

---

### Task 1: Database model, RLS, and idempotent Neste seed

**Files:**
- Create: `work-app/supabase/migrations/20260823150000_customer_sites_and_neste.sql`
- Modify: `work-app/src/lib/security.test.ts`

**Interfaces:**
- Produces table `public.customer_sites` with columns `id`, `customer_id`, `name`, `external_code`, `address`, `city`, `county`, `latitude`, `longitude`, `requires_lift`, `service_notes`, `active`, `source`, `source_ref`, `created_at`, `updated_at`.
- Produces nullable `public.jobs.site_id -> customer_sites.id`.
- Produces RLS: manager CRUD, operator SELECT, operator INSERT for manual sites.
- Seeds `NESTE-001` … `NESTE-059` under existing customer `Neste`.

- [ ] **Step 1: Write the failing security/schema test**

Append tests that read the new migration and verify table, FK, RLS, idempotent unique key, and 59 external codes:

```ts
test('customer sites migration adds reusable sites and 59 Neste stations', () => {
  const sql = readFileSync(resolve(root, 'supabase/migrations/20260823150000_customer_sites_and_neste.sql'), 'utf8')
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
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test` from `work-app`.
Expected: FAIL because `20260823150000_customer_sites_and_neste.sql` does not exist.

- [ ] **Step 3: Create migration**

Create the schema with:

```sql
create table if not exists public.customer_sites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  name text not null,
  external_code text,
  address text,
  city text,
  county text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  requires_lift boolean,
  service_notes text,
  active boolean not null default true,
  source text,
  source_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customer_sites_customer_external_code_uq
on public.customer_sites(customer_id, external_code)
where external_code is not null;

alter table public.jobs
  add column if not exists site_id uuid references public.customer_sites(id);
```

Add `set_updated_at` trigger, enable RLS, manager CRUD, operator SELECT, and operator INSERT restricted to `source = 'manual'` and an existing customer.

Use a CTE that first finds the existing customer with `lower(name) = 'neste'`; only if missing, create one. Seed all 59 rows from the approved Neste Sheet source as a `values` relation with exact station name/address, `NESTE-001` … `NESTE-059`, lift requirement, and compact service note. Use:

```sql
on conflict (customer_id, external_code) where external_code is not null
do update set
  name = excluded.name,
  address = excluded.address,
  requires_lift = excluded.requires_lift,
  service_notes = excluded.service_notes,
  active = true,
  source = 'neste_import',
  source_ref = excluded.source_ref;
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm test`.
Expected: PASS for the new migration test and all existing tests.

- [ ] **Step 5: Commit**

Commit message: `feat: add customer sites and Neste locations`

---

### Task 2: Query layer for sites and job site relation

**Files:**
- Modify: `work-app/src/lib/queries.ts`
- Modify: `work-app/src/lib/domain.ts`
- Test: `work-app/tests/acceptance.test.ts`

**Interfaces:**
- Produces `getCustomerSites()` returning active site rows ordered by customer/name.
- `getReferenceData()` returns `sites` in addition to existing customers/workTypes/vehicles.
- Job detail queries include `site:customer_sites(...)`.

- [ ] **Step 1: Write failing acceptance test**

```ts
test('job reference data includes customer sites', () => {
  const queries = readFileSync(resolve(root, 'src/lib/queries.ts'), 'utf8')
  assert.match(queries, /customer_sites/)
  assert.match(queries, /sites:/)
  assert.match(queries, /site:customer_sites/)
})
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test`.
Expected: FAIL because queries do not expose sites yet.

- [ ] **Step 3: Implement query support**

Extend `getReferenceData()` to query:

```ts
supabase.from('customer_sites')
  .select('id,customer_id,name,address,city,county,requires_lift,service_notes,source')
  .eq('active', true)
  .order('name')
```

Return it as `sites`. Add `site:customer_sites(id,customer_id,name,address,city,county,requires_lift,service_notes)` to manager/operator job detail selects.

- [ ] **Step 4: Run tests**

Run: `npm test && npm run typecheck`.
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: expose customer sites to job flows`

---

### Task 3: Shared Customer → Site form component

**Files:**
- Create: `work-app/src/components/JobLocationFields.tsx`
- Modify: `work-app/src/app/manager/jobs/new/page.tsx`
- Modify: `work-app/src/components/JobEditForm.tsx`
- Test: `work-app/tests/acceptance.test.ts`

**Interfaces:**
- Consumes `customers`, `sites`, current `customerId/siteId/objectName/address`.
- Produces form fields `customerId`, `siteId`, `newSiteName`, `newSiteAddress`, `objectName`, `address`.
- Site selection is filtered to the selected customer and autofills object/address in the browser.

- [ ] **Step 1: Write failing acceptance test**

```ts
test('job forms support customer site selection and new site entry', () => {
  const component = readFileSync(resolve(root, 'src/components/JobLocationFields.tsx'), 'utf8')
  const newPage = readFileSync(resolve(root, 'src/app/manager/jobs/new/page.tsx'), 'utf8')
  const edit = readFileSync(resolve(root, 'src/components/JobEditForm.tsx'), 'utf8')
  assert.match(component, /name="customerId"/)
  assert.match(component, /name="siteId"/)
  assert.match(component, /newSiteName/)
  assert.match(component, /\+ Lisa uus asukoht/)
  assert.match(newPage, /JobLocationFields/)
  assert.match(edit, /JobLocationFields/)
})
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test`.
Expected: FAIL because `JobLocationFields.tsx` does not exist.

- [ ] **Step 3: Implement `JobLocationFields`**

Make it a client component (`'use client'`). It maintains selected customer/site and local object/address values. Rules:

1. Customer change clears an incompatible site.
2. Site dropdown shows only sites whose `customer_id` matches selected customer.
3. Selecting a site copies `site.name` to object name and `site.address` to address.
4. `+ Lisa uus asukoht` reveals `newSiteName` and `newSiteAddress` inputs; selecting it clears `siteId`.
5. Manual object/address fields remain editable after autofill so a one-off job snapshot can differ from site master data.
6. If a customer has no sites, show `Asukohti pole — lisa uus` without breaking the old free-text flow.

- [ ] **Step 4: Replace duplicated location fields in new/edit forms**

Pass `refs.customers`, `refs.sites`, and current job values into the component. Keep all other scheduling/pricing fields unchanged.

- [ ] **Step 5: Run tests**

Run: `npm test && npm run typecheck && npm run build`.
Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `feat: add customer site picker to job forms`

---

### Task 4: Save selected or newly-created site on new jobs

**Files:**
- Modify: `work-app/src/app/manager/jobs/actions.ts`
- Create: `work-app/src/lib/customer-sites.ts`
- Create: `work-app/src/lib/customer-sites.test.ts`

**Interfaces:**
- Produces pure helper `siteSnapshotInput(formDataLike)` for site/new-site normalization.
- `createJob()` inserts manual `customer_sites` row when `newSiteName` is supplied with a customer, then saves returned `site_id` on the job.
- Selected existing site is stored without mutating site master data.

- [ ] **Step 1: Write failing helper tests**

Cover:

```ts
test('existing site selection wins when supplied', () => {
  assert.deepEqual(normalizeSiteChoice({ siteId: 'site-1', newSiteName: '', newSiteAddress: '' }), {
    siteId: 'site-1', newSite: null,
  })
})

test('new site is normalized when no existing site is selected', () => {
  assert.deepEqual(normalizeSiteChoice({ siteId: '', newSiteName: 'Uus jaam', newSiteAddress: 'Test 1' }), {
    siteId: null, newSite: { name: 'Uus jaam', address: 'Test 1' },
  })
})
```

- [ ] **Step 2: Run RED**

Run: `npm test`.
Expected: FAIL because helper does not exist.

- [ ] **Step 3: Implement helper and server action integration**

In `createJob()`:

- normalize customer/site/new-site fields;
- if a new site is requested and `customerId` is present, insert `customer_sites` with `source: 'manual'` and capture its ID;
- save `site_id` on `jobs`;
- preserve current `object_name` and `address` values as snapshots;
- if site creation fails, redirect with the real Supabase error using existing `formatSaveError`.

- [ ] **Step 4: Revalidate affected pages**

Revalidate `/manager/customers`, `/manager/jobs/new`, `/manager`, `/manager/calendar`, `/operator`.

- [ ] **Step 5: Run tests/build**

Run: `npm test && npm run typecheck && npm run build`.
Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `feat: persist job customer sites`

---

### Task 5: Allow manager and operator edits to change or create a site

**Files:**
- Modify: `work-app/supabase/migrations/20260823150000_customer_sites_and_neste.sql` before applying live, or create follow-up migration if Task 1 is already applied.
- Modify: `work-app/src/app/job-edit-actions.ts`
- Modify: `work-app/src/components/JobEditForm.tsx`
- Modify: `work-app/src/lib/security.test.ts`

**Interfaces:**
- `public.update_editable_job(...)` accepts `p_site_id uuid` and writes `site_id` while preserving `operator_id` and status.
- Server action may create a manual site first, then sends its ID to guarded RPC.

- [ ] **Step 1: Write failing security/action tests**

Verify the migration/RPC contains `p_site_id uuid` and `site_id = p_site_id`, and action passes `p_site_id`.

- [ ] **Step 2: Run RED**

Run: `npm test`.
Expected: FAIL because edit RPC/action do not support site IDs.

- [ ] **Step 3: Update guarded RPC**

Drop the old `update_editable_job` signature and recreate it with `p_site_id uuid`. Keep existing permission/status guards and pricing snapshot behavior. Set `site_id = p_site_id` in the job update.

- [ ] **Step 4: Update `updateJob()` server action**

Use the same site normalization/new-site insertion as Task 4 and pass the resolved site ID to RPC. Preserve all existing redirect/revalidation behavior for manager and worker views.

- [ ] **Step 5: Run tests/build**

Run: `npm test && npm run typecheck && npm run build`.
Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `feat: support sites when editing jobs`

---

### Task 6: Customer CRM shows and manages saved locations

**Files:**
- Modify: `work-app/src/lib/queries.ts`
- Modify: `work-app/src/app/manager/customers/page.tsx`
- Modify: `work-app/src/app/manager/customers/actions.ts`
- Test: `work-app/tests/acceptance.test.ts`

**Interfaces:**
- Customer query includes `customer_sites(id,name,address,active,requires_lift,source)`.
- Manager can expand a customer card to see its sites and add a manual one.

- [ ] **Step 1: Write failing acceptance test**

Require customer page to show `Asukohad`, `+ Lisa asukoht`, and the action `createCustomerSite`.

- [ ] **Step 2: Run RED**

Run: `npm test`.
Expected: FAIL.

- [ ] **Step 3: Extend customer query/UI/actions**

Show site count on each customer card. In an expandable block list site name + address + lift requirement. Add a small form with hidden customer ID, site name, address, and optional `Tõstuk vajalik` checkbox. `createCustomerSite()` inserts `source='manual'` and revalidates customer/job pages.

- [ ] **Step 4: Run tests/build**

Run: `npm test && npm run typecheck && npm run build`.
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: manage customer locations in CRM`

---

### Task 7: Apply live migration, verify Neste data, and smoke-test site snapshots

**Files:**
- No new source file unless migration drift requires a follow-up migration.

**Interfaces:**
- Live Supabase project `vplpaqcytzbcfpycoamw` contains exactly 59 active `neste_import` sites for customer `Neste` after one or repeated migration applications.

- [ ] **Step 1: Apply migration with Supabase migration tool**

Apply the committed migration(s) to `vplpaqcytzbcfpycoamw`.

- [ ] **Step 2: Verify live counts**

Run read-only SQL equivalent to:

```sql
select c.name, count(*) as sites
from public.customer_sites s
join public.customers c on c.id = s.customer_id
where s.source = 'neste_import'
group by c.name;
```

Expected: `Neste | 59`.

Also verify unique external codes count is 59 and `NESTE-001`/`NESTE-059` exist.

- [ ] **Step 3: Transactional smoke test**

Inside `begin … rollback`, simulate authenticated manager and operator sessions:

- manager can select `Neste → Pirita`;
- operator can read Neste sites;
- operator can insert a `source='manual'` site;
- updating an unfinished job with a site changes `site_id` and snapshot address/object but preserves `operator_id`;
- cancelled/completed job edit remains rejected.

Rollback so no test rows remain.

- [ ] **Step 4: Final CI and deploy verification**

Run/verify GitHub Actions: `npm test`, `npm run typecheck`, `npm run build` all success. Verify final commit Vercel status = `success`.

- [ ] **Step 5: Final commit if verification required code changes**

Commit message: `fix: finalize customer site release`
