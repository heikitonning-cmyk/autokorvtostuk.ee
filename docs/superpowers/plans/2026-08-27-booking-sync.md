# Confirmed Booking Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make confirmed website bookings importable into the work app exactly once and prepare a secure endpoint for the website confirmation backend.

**Architecture:** A pure TypeScript parser/normalizer converts the current booking email/payload format into a stable booking record. Supabase stores `source` + `external_ref` with a unique index for idempotency. A Supabase Edge Function validates a runtime bearer secret and upserts the confirmed job using the service-role client.

**Tech Stack:** TypeScript, Node test runner, Supabase Postgres, Supabase Edge Functions/Deno.

**Spec:** `docs/superpowers/specs/2026-08-27-booking-sync-design.md`

## Global Constraints

- Never commit integration secrets.
- Website bookings use `source = 'website'` and `external_ref = 'AT-N'`.
- Duplicate delivery of the same external reference must not create a second job.
- Imported confirmed bookings use status `kinnitatud` and no operator assignment.
- Do not backfill obvious test bookings automatically.

---

### Task 1: Booking email/payload normalization

**Files:**
- Create: `work-app/src/lib/booking-import.test.ts`
- Create: `work-app/src/lib/booking-import.ts`

**Interfaces:**
- Produces: `parseBookingEmail(text: string): Partial<ConfirmedBooking>` and `normalizeConfirmedBooking(input: ConfirmedBookingInput): ConfirmedBooking`.

- [ ] **Step 1: Write failing tests** for parsing `Viide: AT-10`, date/time, `Töö: Katuse hooldus · 2 h · ilma lisatöömeheta`, object and total; add an older confirmation without `Töö:` and a malformed reference case.
- [ ] **Step 2: Run `npm test -- src/lib/booking-import.test.ts` and verify failure** because the module/functions do not exist.
- [ ] **Step 3: Implement the minimal parser/normalizer** with strict `AT-<number>`, ISO date, optional HH:MM, positive-hours validation, and non-negative total validation.
- [ ] **Step 4: Run `npm test` and `npm run typecheck`; verify green.**
- [ ] **Step 5: Commit.**

### Task 2: Idempotent external booking identity

**Files:**
- Create: `work-app/supabase/migrations/20260827193000_booking_external_refs.sql`
- Create/modify test: `work-app/tests/booking-import-schema.test.ts`

**Interfaces:**
- Produces DB columns `jobs.source text`, `jobs.external_ref text` and unique partial index `jobs_source_external_ref_uidx`.

- [ ] **Step 1: Write a failing schema test** that requires both columns and the unique partial index in the migration text.
- [ ] **Step 2: Run the test and verify it fails** because the migration is absent.
- [ ] **Step 3: Add the migration** using additive nullable columns plus the unique partial index.
- [ ] **Step 4: Run full tests/typecheck and verify green.**
- [ ] **Step 5: Commit.**

### Task 3: Secure booking-confirmed Edge Function

**Files:**
- Create: `work-app/supabase/functions/booking-confirmed/index.ts`
- Create: `work-app/supabase/functions/booking-confirmed/logic.ts`
- Create: `work-app/supabase/functions/booking-confirmed/logic.test.ts`

**Interfaces:**
- Consumes: normalized `ConfirmedBooking` contract.
- Produces: authenticated HTTP POST endpoint that upserts one `jobs` row on `source,external_ref`.

- [ ] **Step 1: Write failing tests** for bearer-secret validation, payload normalization, DB upsert shape, status `kinnitatud`, and duplicate reference conflict target.
- [ ] **Step 2: Run the Edge Function logic test and verify failure** because the logic module is absent.
- [ ] **Step 3: Implement pure logic** and a thin Deno HTTP entrypoint using `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `BOOKING_SYNC_SECRET`; reject missing/wrong secret with 401.
- [ ] **Step 4: Run all tests/typecheck and verify green.**
- [ ] **Step 5: Commit.**

### Task 4: CI and deployment verification

**Files:**
- Modify if needed: `.github/workflows/work-app-ci.yml`

**Interfaces:** none.

- [ ] **Step 1: Ensure CI includes the new Node-compatible tests.**
- [ ] **Step 2: Push/PR and verify Work app CI passes.**
- [ ] **Step 3: Apply the SQL migration to Supabase production using the migration tool.**
- [ ] **Step 4: Deploy the Edge Function with JWT disabled only because the function performs its own shared-secret authentication.**
- [ ] **Step 5: Run Supabase security advisor and inspect function logs.**

### Task 5: Website hookup after source recovery

**Files:** current public website backend source, once recovered.

**Interfaces:** POST JSON to `booking-confirmed` with `Authorization: Bearer <BOOKING_SYNC_SECRET>`.

- [ ] **Step 1: Locate the currently deployed website source/config that sends confirmation through Resend.**
- [ ] **Step 2: Add a failing integration test requiring the confirmation path to call the booking endpoint after successful confirmation email creation.**
- [ ] **Step 3: Add the minimal POST call using the same booking data that produced the confirmation email.**
- [ ] **Step 4: Verify one confirmation creates one app job and a retry creates no duplicate.**
- [ ] **Step 5: Deploy and verify production logs.**
