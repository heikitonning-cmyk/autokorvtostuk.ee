# User Claim and Invite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manager/user view switch, self-service job claiming/releasing, and 7-day one-time worker invite links that always create operator-only accounts.

**Architecture:** Keep the existing `manager` / `operator` authorization roles, but allow managers to render the worker interface without changing their stored role. Move job ownership changes into atomic PostgreSQL security-definer functions, expand RLS so workers can read free jobs and their own jobs, and use a hashed invite-token flow backed by `user_invites` plus a guarded `auth.users` trigger that creates the operator profile during invite signup.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase Auth/Postgres/RLS, Node test runner, Vercel.

**Spec:** `docs/superpowers/specs/2026-08-23-user-claim-invite-design.md`

## Global Constraints

- Branch: `app-v1-build` only.
- Database roles remain `manager` and `operator`; UI labels are `Juht` and `Kasutaja`.
- Managers can use both views without changing their stored role.
- Operators can never access manager routes/actions.
- Every active user can see every free non-cancelled job and claim it.
- Claiming must be atomic; the first claimant wins.
- A user can release only their own unstarted job.
- No open public signup; registration requires a valid one-time invite.
- Invite lifetime is exactly 7 days and invite role is always `operator`.
- No clear-text invite token is stored in Postgres.
- Existing manager workflow, pricing, job execution, photos and audit logging must remain functional.

---

### Task 1: Lock authorization and worker-view behavior with tests

**Files:**
- Modify: `work-app/src/lib/auth.ts`
- Modify: `work-app/src/lib/auth.test.ts`
- Modify: `work-app/src/lib/security.test.ts`

**Interfaces:**
- Produces: `canAccessView(role, view)` and regression expectations for manager dual-view access, operator manager denial, free-job RLS, claim/release RPCs, invite schema and invite trigger.

- [ ] Add failing tests asserting manager access to both `manager` and `worker` views while operator can access only `worker`.
- [ ] Add failing security tests that require the new migration to define `user_invites`, atomic `claim_job`, guarded `release_job`, free-or-own job select policy, invite validation, and invite-signup profile trigger.
- [ ] Run `npm test` and verify the new tests fail for the missing behavior.
- [ ] Implement `canAccessView(role, view)` with `manager -> both`, `operator -> worker only`.
- [ ] Re-run the focused auth tests and verify green.

### Task 2: Add database model, RLS and atomic claim/release

**Files:**
- Create: `work-app/supabase/migrations/20260823122000_user_claims_and_invites.sql`

**Interfaces:**
- Produces: `public.user_invites`, `public.claim_job(uuid)`, `public.release_job(uuid)`, `public.validate_user_invite(text)`, updated worker read policies, and guarded invite signup trigger on `auth.users`.

- [ ] Create `user_invites` with hashed token, 7-day expiry metadata, single-use/revocation fields, manager-only RLS, and `role = 'operator'` constraint.
- [ ] Replace the operator jobs select policy with free-or-own visibility: own jobs or `operator_id is null and status <> 'tuhistatud'`.
- [ ] Expand customer visibility only as needed for free or own visible jobs; keep settings/users protected.
- [ ] Implement `claim_job(p_job_id uuid)` as one atomic `UPDATE ... WHERE operator_id IS NULL AND status <> 'tuhistatud' RETURNING id`; derive owner only from `auth.uid()` and reject inactive/non-app users.
- [ ] Implement `release_job(p_job_id uuid)` so only the current owner can clear `operator_id`, only before `actual_start`, and never for started/completed/follow-up/cancelled states.
- [ ] Implement `validate_user_invite(p_token_hash text)` returning only a boolean for valid unused unrevoked unexpired operator invites; grant execute to anon/authenticated while hiding invite rows.
- [ ] Add an `auth.users` trigger that acts only when `raw_user_meta_data.app_registration = 'worker_invite'`, locks the invite row by hash, rejects invalid/used/expired/revoked invites, inserts `public.users` as active `operator`, then marks the invite used.
- [ ] Re-run security tests and verify green.
- [ ] Apply the migration to connected Supabase only after the file tests pass.
- [ ] Verify live schema/function presence and run a rollback-only claim/release SQL smoke test using the current manager UID as a worker-view claimant.

### Task 3: Build worker job selection and manager view switch

**Files:**
- Modify: `work-app/src/lib/session.ts`
- Modify: `work-app/src/lib/queries.ts`
- Modify: `work-app/src/components/AppShell.tsx`
- Modify: `work-app/src/app/manager/layout.tsx`
- Modify: `work-app/src/app/operator/layout.tsx`
- Modify: `work-app/src/app/operator/page.tsx`
- Modify: `work-app/src/components/OperatorJobCard.tsx`
- Create: `work-app/src/app/operator/actions.ts`
- Modify: `work-app/src/app/manager/jobs/new/page.tsx`
- Modify: `work-app/src/app/manager/jobs/actions.ts`

**Interfaces:**
- Produces: `requireView('manager'|'worker')`, `getWorkerJobs(userId)`, `claimJob(formData)`, `releaseJob(formData)`, and manager-only `Juht | Kasutaja` switch.

- [ ] Add `requireView(view)` using `canAccessView`; keep `requireUser('manager')` for manager mutations.
- [ ] Allow `/operator` layout for both managers and operators while keeping `/manager` manager-only.
- [ ] Add `getWorkerJobs(userId)` returning two explicit groups: free non-cancelled jobs and current user's non-cancelled jobs; manager worker-view query must still filter to free + own rather than all manager-visible jobs.
- [ ] Add `claimJob` server action that calls `claim_job`; on conflict show “Keegi teine jõudis selle töö juba võtta.” and refresh the worker page.
- [ ] Add `releaseJob` action that calls `release_job`; surface a clear started/not-owner error.
- [ ] Rebuild worker landing page with `Minu aktiivne töö`, `Minu tööd`, and `Vabad tööd`; free cards get `Võta töö`, own unstarted cards get `Vabasta töö`.
- [ ] Update `OperatorJobCard` to support free/own action mode without losing navigate/call/open-work actions.
- [ ] Remove operator selection from manager `Lisa töö`; newly created work remains `operator_id = null`.
- [ ] Add manager-only `Juht | Kasutaja` view switch in `AppShell`; operator accounts never see a manager switch/link.
- [ ] Run the full Node tests and fix regressions before continuing.

### Task 4: Add manager users page and invite-link creation

**Files:**
- Create: `work-app/src/app/manager/users/page.tsx`
- Create: `work-app/src/app/manager/users/actions.ts`
- Create: `work-app/src/components/InviteLinkForm.tsx`
- Modify: `work-app/src/lib/queries.ts`
- Modify: `work-app/src/components/AppShell.tsx`

**Interfaces:**
- Produces: `getUsersAndInvites()`, `createWorkerInvite()`, manager `Kasutajad` page and reusable generated invite link UI.

- [ ] Add manager query returning users plus recent active/used/revoked invites without exposing token hashes in UI.
- [ ] Implement `createWorkerInvite()` using `crypto.randomBytes(32)`, store only SHA-256 hex hash, set `expires_at = now + 7 days`, and return the raw one-time URL to the manager action state.
- [ ] Build `InviteLinkForm` client component with a single `Loo kutselink` button and read-only generated full URL; do not persist raw token in a query parameter or database.
- [ ] Add `/manager/users` listing name, email, role label and active/inactive state, plus invite status summary.
- [ ] Add `Kasutajad` to manager navigation only.
- [ ] Add tests/acceptance assertions for the new route and manager-only invite action where practical.

### Task 5: Add invite registration page and signup handoff

**Files:**
- Create: `work-app/src/lib/invites.ts`
- Create: `work-app/src/lib/invites.test.ts`
- Create: `work-app/src/app/register/[token]/page.tsx`
- Create: `work-app/src/app/register/[token]/actions.ts`
- Modify: `work-app/src/app/login/page.tsx`

**Interfaces:**
- Produces: `hashInviteToken(token)`, server invite validation, invite-only `signUp`, and registration success/error UX.

- [ ] Add tests for deterministic SHA-256 hashing, empty/invalid token handling helpers, and UI-safe invite error mapping.
- [ ] Implement `hashInviteToken` with Node `crypto.createHash('sha256')`.
- [ ] Registration page hashes the path token server-side and calls `validate_user_invite`; invalid/expired/used/revoked tokens render an error and no form.
- [ ] Registration form accepts name, email, password and optional phone.
- [ ] Registration action validates the invite again, calls `supabase.auth.signUp` with metadata `{ app_registration: 'worker_invite', invite_hash, name, phone }`, and never accepts a role field from the browser.
- [ ] On session-bearing signup redirect to `/operator`; when email confirmation is required redirect to `/login?registered=1` with a clear “konto loodud / kinnita e-post” message.
- [ ] Preserve concrete Auth/Supabase error text for already-used email and other registration failures without leaking token hash.
- [ ] Re-run full tests.

### Task 6: Final verification and deploy

**Files:** all files above.

- [ ] Run a fresh full `npm test` equivalent and confirm 0 failures.
- [ ] Confirm Vercel build status for the final branch HEAD is `success`.
- [ ] Verify the live Supabase migration exists and the claim/release RPC smoke test passes with rollback.
- [ ] Verify branch HEAD contains the manager/user switch, free-job claim/release flow, users page, invite creation and registration route.
- [ ] Report any limitation that cannot be end-to-end exercised without consuming a real email address; do not claim that path was live-tested if it was not.
