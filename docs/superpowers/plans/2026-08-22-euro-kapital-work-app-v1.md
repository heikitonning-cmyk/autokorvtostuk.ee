# Euro Kapital Work App V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first PWA for Euro Kapital OÜ where a manager creates and supervises lift jobs and an operator can execute assigned jobs from phone with minimal typing.

**Architecture:** Keep the existing static SEO site untouched. Put the app in `work-app/` as a standalone Next.js/TypeScript project intended for `app.autokorvtostuk.ee`; Supabase provides auth, PostgreSQL, storage and RLS. Domain rules such as status transitions and pricing are pure TypeScript modules so they can be tested independently of Supabase.

**Tech Stack:** Next.js 15, React 19, TypeScript, Supabase (`@supabase/ssr`, `@supabase/supabase-js`), Vitest, Testing Library, Playwright-ready UI, CSS, PWA manifest/service worker.

**Spec:** `docs/superpowers/specs/2026-08-22-euro-kapital-work-app-design.md`

## Global Constraints

- Existing public SEO files at repository root must not be changed by the work app implementation.
- Mobile first; operator actions use large touch targets and minimize typing.
- All work app pages require Supabase authentication.
- Manager sees all jobs; operator can only read/update assigned jobs; RLS enforces this server-side.
- Prices and work types are data/settings, not hard-coded business rules in UI.
- Every confirmed job stores a price snapshot; later settings changes must not change historical jobs.
- Start/finish actions must show save success/failure and never pretend a failed write succeeded.
- Photos are private Supabase Storage objects.
- V1 excludes accounting, payroll, fleet GPS, native app stores, route optimization, AI pricing, multi-lift dispatch and customer portal.

---

### Task 1: App shell, domain types and tests

**Files:**
- Create: `work-app/package.json`
- Create: `work-app/tsconfig.json`
- Create: `work-app/next.config.ts`
- Create: `work-app/vitest.config.ts`
- Create: `work-app/src/app/layout.tsx`
- Create: `work-app/src/app/globals.css`
- Create: `work-app/src/lib/domain.ts`
- Create: `work-app/src/lib/status.ts`
- Test: `work-app/src/lib/status.test.ts`

**Interfaces:**
- Produces: `JobStatus`, `UserRole`, `Job`, `Customer`, `WorkType`, `PriceSettings`, `canTransition(from,to)`.

- [ ] **Step 1: Write failing status tests**

```ts
import { describe, expect, it } from 'vitest'
import { canTransition } from './status'

describe('canTransition', () => {
  it('allows confirmed job to start', () => expect(canTransition('kinnitatud', 'toob')).toBe(true))
  it('does not allow cancelled job to start', () => expect(canTransition('tuhistatud', 'toob')).toBe(false))
  it('allows active job to finish or need follow-up', () => {
    expect(canTransition('toob', 'tehtud')).toBe(true)
    expect(canTransition('toob', 'vajab_jareltegevust')).toBe(true)
  })
})
```

- [ ] **Step 2: Run `npm test -- status.test.ts` and verify failure because modules do not exist.**
- [ ] **Step 3: Implement domain types and an explicit transition map with only spec-approved statuses.**
- [ ] **Step 4: Run tests and `npm run typecheck`; both must pass.**
- [ ] **Step 5: Commit `feat: scaffold work app domain`.**

### Task 2: Pricing engine and snapshot preservation

**Files:**
- Create: `work-app/src/lib/pricing.ts`
- Test: `work-app/src/lib/pricing.test.ts`

**Interfaces:**
- Consumes: `PriceSettings` from `domain.ts`.
- Produces: `calculatePrice(input, settings): PriceBreakdown`, `createPriceSnapshot(settings): PriceSnapshot`.

- [ ] **Step 1: Write failing tests** covering minimum order, lift hours, Tallinn drive hour, kilometres, helper hours and manual adjustment.

```ts
expect(calculatePrice({ liftHours: 1, driveHours: 0, km: 0, helperHours: 0, adjustment: 0 }, settings).total).toBe(90)
expect(calculatePrice({ liftHours: 3, driveHours: 1, km: 20, helperHours: 2, adjustment: 0 }, settings).total).toBe(3*45 + 45 + 20 + 2*35)
```

- [ ] **Step 2: Run tests and verify failure.**
- [ ] **Step 3: Implement pure pricing functions; snapshot must be a value copy, not a mutable settings reference.**
- [ ] **Step 4: Add regression test proving changing `settings.hourlyRate` after snapshot creation does not mutate the old snapshot.**
- [ ] **Step 5: Run tests/typecheck and commit `feat: add pricing and snapshots`.**

### Task 3: Supabase schema, audit log and RLS

**Files:**
- Create: `work-app/supabase/migrations/20260822190000_init.sql`
- Create: `work-app/supabase/seed.sql`
- Create: `work-app/src/lib/supabase/browser.ts`
- Create: `work-app/src/lib/supabase/server.ts`
- Create: `work-app/src/lib/supabase/middleware.ts`
- Create: `work-app/src/middleware.ts`
- Create: `work-app/.env.example`
- Test: `work-app/src/lib/security.test.ts`

**Interfaces:**
- Produces tables `users`, `customers`, `vehicles`, `work_types`, `settings`, `jobs`, `job_photos`, `job_events`; private storage bucket `job-photos`.
- Produces helper SQL functions `current_app_user_id()`, `current_app_role()`, `is_manager()`.

- [ ] **Step 1: Write a schema-contract test that reads the migration and asserts all required tables/status values/RLS clauses are present.**
- [ ] **Step 2: Run test and verify failure.**
- [ ] **Step 3: Implement migration with FK constraints, status check, timestamps, audit trigger and RLS policies: manager all rows; operator only jobs with `operator_id = auth.uid()` plus related customer/work-type/photo rows needed for assigned jobs.**
- [ ] **Step 4: Add private storage policies: managers all job photos; operators only assigned-job photos.**
- [ ] **Step 5: Run tests/typecheck and commit `feat: add supabase schema and rls`.**

### Task 4: Authentication and role-based app shell

**Files:**
- Create: `work-app/src/app/page.tsx`
- Create: `work-app/src/app/login/page.tsx`
- Create: `work-app/src/app/auth/callback/route.ts`
- Create: `work-app/src/components/AppShell.tsx`
- Create: `work-app/src/lib/auth.ts`
- Test: `work-app/src/lib/auth.test.ts`

**Interfaces:**
- Produces `requireUser(): Promise<AppUser>` and role redirect `/manager` or `/operator`.

- [ ] **Step 1: Write tests for `homeForRole('manager') === '/manager'` and operator equivalent.**
- [ ] **Step 2: Run and verify failure.**
- [ ] **Step 3: Implement Supabase email/password login, callback/session refresh, protected routes and role routing.**
- [ ] **Step 4: Verify unauthenticated requests redirect to `/login`; authenticated users never land in the other role's root view.**
- [ ] **Step 5: Commit `feat: add authentication and role shell`.**

### Task 5: Manager dashboard, create-job flow and job detail

**Files:**
- Create: `work-app/src/app/manager/page.tsx`
- Create: `work-app/src/app/manager/jobs/new/page.tsx`
- Create: `work-app/src/app/manager/jobs/[id]/page.tsx`
- Create: `work-app/src/app/manager/jobs/actions.ts`
- Create: `work-app/src/components/JobCard.tsx`
- Create: `work-app/src/components/StatusBadge.tsx`
- Create: `work-app/src/components/MetricCard.tsx`
- Create: `work-app/src/lib/queries.ts`
- Test: `work-app/src/app/manager/jobs/actions.test.ts`

**Interfaces:**
- Produces `createJob(formData)`, `updateJob(id, formData)`, `confirmJob(id)`.
- `confirmJob` reads current settings and persists `price_snapshot_json` and `estimated_total`.

- [ ] **Step 1: Write failing tests for required fields and immutable confirmation snapshot.**
- [ ] **Step 2: Implement create job form with customer, date/time, address, object, work type, description, operator and pricing inputs.**
- [ ] **Step 3: Implement manager dashboard sections: today timeline, new jobs, overdue-not-started, follow-up jobs, 7-day free windows, today/week/month metrics, `+ Lisa töö`.**
- [ ] **Step 4: Implement job detail with all operational fields, event history and confirm/cancel actions.**
- [ ] **Step 5: Run tests/typecheck/build and commit `feat: add manager job workflow`.**

### Task 6: Operator today, start, live work and finish

**Files:**
- Create: `work-app/src/app/operator/page.tsx`
- Create: `work-app/src/app/operator/jobs/[id]/page.tsx`
- Create: `work-app/src/app/operator/jobs/[id]/finish/page.tsx`
- Create: `work-app/src/app/operator/jobs/actions.ts`
- Create: `work-app/src/components/OperatorJobCard.tsx`
- Create: `work-app/src/components/ElapsedTimer.tsx`
- Test: `work-app/src/app/operator/jobs/actions.test.ts`

**Interfaces:**
- Produces `startJob(id)`, `finishJob(id, payload)`, `addJobNote(id,note)`.
- `finishJob` returns status `tehtud` only when required completion data exists; otherwise `vajab_jareltegevust`.

- [ ] **Step 1: Write failing tests for status transition and completion validation (`actualKm`, billing-confirmation and photo presence).**
- [ ] **Step 2: Implement operator Today page: next job hero card, navigate link, `tel:` call link, description and large `ALUSTA TÖÖD` action.**
- [ ] **Step 3: Implement active job view with elapsed timer, helper toggle/hours, note, extra work and `LÕPETA TÖÖ`.**
- [ ] **Step 4: Implement finish form and clear success/error feedback.**
- [ ] **Step 5: Run tests/typecheck/build and commit `feat: add operator workday flow`.**

### Task 7: Photo upload, clients, calendar and settings

**Files:**
- Create: `work-app/src/app/api/jobs/[id]/photos/route.ts`
- Create: `work-app/src/components/PhotoUploader.tsx`
- Create: `work-app/src/app/manager/customers/page.tsx`
- Create: `work-app/src/app/manager/calendar/page.tsx`
- Create: `work-app/src/app/manager/settings/page.tsx`
- Create: `work-app/src/app/manager/settings/actions.ts`
- Test: `work-app/src/app/manager/settings/actions.test.ts`

**Interfaces:**
- Produces private photo upload endpoint, customer summary rows, day/week/month calendar query and manager-only settings writes.

- [ ] **Step 1: Write failing test proving settings action rejects non-manager caller in addition to RLS.**
- [ ] **Step 2: Implement signed/private job photo upload and pending/error UI state.**
- [ ] **Step 3: Implement customer list with last job, job count and revenue; calendar with day/week/month filters without horizontal-scroll dependency on phone.**
- [ ] **Step 4: Implement settings editor for hourly rate, minimum order, drive hour logic/rate, km rate, helper rate, work types and seasonal services.**
- [ ] **Step 5: Run tests/typecheck/build and commit `feat: add photos calendar customers settings`.**

### Task 8: PWA/offline shell, acceptance tests and deployment docs

**Files:**
- Create: `work-app/src/app/manifest.ts`
- Create: `work-app/public/sw.js`
- Create: `work-app/public/icon.svg`
- Create: `work-app/src/components/ServiceWorkerRegistration.tsx`
- Create: `work-app/tests/acceptance.test.ts`
- Create: `work-app/README.md`

**Interfaces:**
- Produces installable PWA shell and documented Vercel/Supabase deployment steps.

- [ ] **Step 1: Write acceptance contract tests checking manager/operator routes, manifest, service worker, status/pricing tests and migration.**
- [ ] **Step 2: Implement manifest and conservative service worker that caches only app shell/static assets and never treats failed job mutation as success.**
- [ ] **Step 3: Add mobile CSS polish: minimum 48px primary action targets, sticky bottom operator actions, readable cards, network state feedback.**
- [ ] **Step 4: Document Supabase project setup, applying migration/seed, environment variables, Vercel root directory `work-app`, and mapping `app.autokorvtostuk.ee`.**
- [ ] **Step 5: Run `npm test`, `npm run typecheck`, `npm run build`; all must pass. Commit `feat: complete work app v1`.**

## Self-review result

- Spec coverage: manager/operator roles, jobs, status flow, pricing snapshot, photos, customers, calendar, settings, audit, RLS, PWA/offline shell and acceptance path are each assigned to a task.
- Deliberate exclusions match the V1 spec; AI and notification integrations are not prerequisites.
- Type/interface naming is consistent across tasks: `JobStatus`, `PriceSettings`, `PriceSnapshot`, `createJob`, `startJob`, `finishJob`.
- No implementation step relies on changing the existing root SEO site.
