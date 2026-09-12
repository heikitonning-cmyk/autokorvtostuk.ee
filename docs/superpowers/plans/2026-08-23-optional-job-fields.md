# Optional Job Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make “Lisa töö” save with minimal information, make scheduling optional with “Aeg määramata”, and expose the real save error.

**Architecture:** Keep the existing Next.js server-action flow, but normalize empty form values to `null` before Supabase insert. Make the database columns nullable with a migration, keep unscheduled jobs visible in manager queries, and make all date-dependent UI/helpers null-safe.

**Tech Stack:** Next.js 16, React 19, TypeScript 7, Supabase/Postgres, Node test runner.

**Spec:** User request in this task; existing app design at `docs/superpowers/specs/2026-08-22-euro-kapital-work-app-design.md`.

## Global Constraints

- Branch: `app-v1-build` only.
- Every “Lisa töö” field is optional.
- Empty planned time is stored as `NULL` and displayed as `Aeg määramata`.
- Minimal form submission must create a job.
- Save failures must display the actual Supabase error, not a generic message.
- CI must pass: `npm test`, `npm run typecheck`, `npm run build`.

---

### Task 1: Lock desired behavior with failing tests

**Files:**
- Modify: `work-app/src/lib/jobs.test.ts`
- Modify: `work-app/src/lib/dashboard.test.ts`

**Interfaces:**
- Consumes: existing `validateNewJob()` and `managerSummary()`.
- Produces: regression expectations for optional input and unscheduled jobs.

- [ ] Change the new-job test so an all-empty job has no missing fields.
- [ ] Add tests requiring empty planned time to format as `Aeg määramata`, empty datetime to normalize to `null`, and real database errors to remain visible.
- [ ] Add a test proving a confirmed unscheduled job is not treated as overdue.
- [ ] Push only the tests and verify CI fails for the expected behavior gaps.

### Task 2: Implement optional form and null-safe job creation

**Files:**
- Modify: `work-app/src/lib/jobs.ts`
- Modify: `work-app/src/app/manager/jobs/actions.ts`
- Modify: `work-app/src/app/manager/jobs/new/page.tsx`

**Interfaces:**
- Produces: `optionalIsoDateTime()`, `formatPlannedTime()`, `formatSaveError()` and optional new-job validation.

- [ ] Make `validateNewJob()` return no required fields.
- [ ] Normalize empty foreign keys/text/datetime to `null` before insert.
- [ ] Remove HTML `required` attributes and make the schedule label explicitly optional.
- [ ] Redirect save failures with the encoded real Supabase error and render it on the form page.

### Task 3: Keep unscheduled jobs usable in the app

**Files:**
- Modify: `work-app/src/components/JobCard.tsx`
- Modify: `work-app/src/lib/dashboard.ts`
- Modify: `work-app/src/lib/queries.ts`
- Modify: `work-app/src/app/manager/jobs/[id]/page.tsx`

**Interfaces:**
- Consumes: nullable `start_planned`.
- Produces: visible unscheduled jobs without false overdue state or invalid date rendering.

- [ ] Display `Aeg määramata` when `start_planned` is null.
- [ ] Exclude null schedules from today/overdue/capacity calculations.
- [ ] Include unscheduled jobs in manager job loading so newly saved minimal jobs remain visible.
- [ ] Use explicit placeholders for missing customer/address/work type in job details.

### Task 4: Make database columns nullable

**Files:**
- Create: `work-app/supabase/migrations/20260823103000_make_job_fields_optional.sql`

**Interfaces:**
- Alters: `public.jobs.customer_id`, `start_planned`, `address`, `work_type_id`.

- [ ] Drop `NOT NULL` from the four columns that currently block minimal inserts.
- [ ] Apply the migration to the connected Supabase project.
- [ ] Verify the live schema accepts nulls.

### Task 5: Verify and commit

**Files:** all above.

- [ ] Run/observe `npm test` passing.
- [ ] Run/observe `npm run typecheck` passing.
- [ ] Run/observe `npm run build` passing.
- [ ] Verify branch deployment/status for the final commit.
- [ ] Confirm the final branch head and report root cause plus deployment state.
