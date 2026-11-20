# User Invite and Job Claiming Design

## Goal

Add a safe worker/user workflow to the Euro Kapital work app so that managers can switch between **Juht** and **Kasutaja** views, workers can register themselves through a manager-created invite link, and all users can see and claim any free job themselves.

## Roles and views

The database keeps two authorization roles:

- `manager` — full manager permissions.
- `operator` — worker/user permissions only.

The UI terminology becomes:

- **Juht** = manager view.
- **Kasutaja** = worker/user view.

A manager is allowed to open both `/manager` and `/operator`. Switching to the user view does not downgrade or change the manager's stored role; it only changes which interface is shown.

An `operator` account can open only the user view and cannot access manager pages, manager mutations, settings, customer management, user management, pricing, or manager statistics.

## Manager/user view switch

For a manager account, the application shell shows a clear two-state switch:

- `Juht`
- `Kasutaja`

Selecting `Juht` opens the normal manager dashboard. Selecting `Kasutaja` opens the exact same worker interface that a normal worker sees.

The manager remains a manager in the database while using the user interface. Authorization remains server-side and RLS-protected rather than relying on hidden UI controls.

## Job assignment model

The manager no longer needs to choose an operator while creating a job.

A job with `operator_id IS NULL` is a **free job**.

Every active user (`operator`) can see all free, non-cancelled jobs. Managers using the user view can see the same free-job list.

The user view has two main groups:

1. **Vabad tööd** — jobs with no owner that are available to claim.
2. **Minu tööd** — jobs currently claimed by the signed-in user.

A free job has a prominent **Võta töö** action. Claiming the job sets `operator_id` to the current user's auth UID.

## Concurrency and job claiming

Job claiming must be atomic in PostgreSQL. The application must not implement this as a read-then-update sequence because two users could otherwise claim the same job at the same time.

Use a database RPC/function that updates only when all of these conditions are true at the moment of the update:

- `jobs.id = requested job id`
- `operator_id IS NULL`
- status is not `tuhistatud`
- signed-in account is active and has role `operator` or `manager`

The function returns success only if exactly one job was claimed.

If another user claimed it first, the second user receives a clear message such as **“Keegi teine jõudis selle töö juba võtta.”** and the free-job list is refreshed.

## Releasing a claimed job

A user may return their own claimed job to the free pool while the work has not started.

The **Vabasta töö** action is allowed only when:

- `operator_id = auth.uid()`
- `actual_start IS NULL`
- status is not `toob`, `tehtud`, `vajab_jareltegevust`, or `tuhistatud`

Releasing sets `operator_id = NULL`. The job immediately becomes visible again under **Vabad tööd**.

A manager can continue to manage jobs through manager controls regardless of assignment.

## Worker/user invite flow

There is no open public registration page.

The manager gets a **Kasutajad** section in the manager interface with:

- list of existing users;
- active/inactive status;
- button **Loo kutselink**.

Creating an invitation generates a cryptographically random token. Only a secure hash of the token is stored in the database.

Invitation properties:

- one-time use;
- expires 7 days after creation;
- role is fixed to `operator` and cannot be chosen by the invitee;
- can be revoked by a manager before use;
- records `created_by`, `created_at`, `expires_at`, `used_at`, and optionally the resulting user ID.

The manager is shown a link such as `/register/<token>` and can send it to the worker by any channel.

## Registration page

Opening a valid invite link shows a simple registration form with:

- name;
- email;
- password;
- optional phone number.

The invite token is validated server-side before account creation.

Registration creates a Supabase Auth user and a matching `public.users` row with:

- `role = 'operator'`
- `active = true`

After successful registration, the invitation is marked used and cannot be used again. The new user is signed in or directed to login and lands in the **Kasutaja** view.

Expired, revoked, already-used, or invalid invite links show a clear error and never create an account.

## Data model changes

Add a `user_invites` table containing at least:

- `id uuid primary key`
- `token_hash text unique not null`
- `role text not null default 'operator'` with a constraint preventing manager invites
- `created_by uuid not null references public.users(id)`
- `created_at timestamptz not null default now()`
- `expires_at timestamptz not null`
- `used_at timestamptz`
- `used_by uuid references public.users(id)`
- `revoked_at timestamptz`

No clear-text invite token is persisted.

Existing `jobs.operator_id` remains the assignment field. No separate assignment table is required for V1.

## Row Level Security

RLS changes are mandatory because the current schema allows operators to read only assigned jobs.

Workers/users may:

- read free jobs (`operator_id IS NULL`) that are not cancelled;
- read their own assigned jobs;
- read related customer/work-type/vehicle data necessary for those visible jobs;
- operate only on their own assigned job after claiming it;
- manage photos only for their own assigned job.

Users must not be able to directly assign a free job to an arbitrary UID. Claim/release ownership is performed through constrained security-definer database functions that derive the user from `auth.uid()`.

Managers retain full job/customer/user management permissions.

Invite records are manager-readable/manageable only. Public invite validation must expose only whether the presented token is valid enough to permit registration, not the invitation table itself.

## User interface

### Manager shell

Add the view switch in a prominent, mobile-friendly location, preferably in the header or immediately below it:

`Juht | Kasutaja`

Manager bottom navigation remains unchanged in manager view.

Add **Kasutajad** to the manager navigation/settings area, where the manager can create invite links and see current users.

### User view

The user landing page prioritizes work selection and execution:

- **Minu aktiivne töö**, when one exists;
- **Minu tööd**;
- **Vabad tööd**.

Each free job shows the useful planning information already stored in the system: date/time, object, address, work type and description where available, with **Võta töö** as the primary action.

A claimed but not started job shows **Vabasta töö** as a secondary action.

Cancelled jobs are not offered as free jobs.

## Error handling

Important user-facing errors must be explicit:

- job already claimed by somebody else;
- job can no longer be released because work has started;
- invalid/expired/used/revoked invite;
- registration email already exists;
- Supabase/Auth failure during registration.

Database mutation errors should preserve the concrete error text for debugging where safe, following the existing save-error pattern.

## Auditability

Existing job audit logging should capture claim/release changes to `operator_id`.

Invite lifecycle changes should be auditable through the invitation timestamps and creator/user references. A separate general audit subsystem is not required for V1.

## Testing

Automated tests must cover at least:

- manager can use both views without changing stored role;
- operator cannot access manager routes/actions;
- free jobs are visible to users;
- assigned jobs disappear from other users' free list;
- atomic claim permits only one winner in a concurrency scenario;
- user can release own unstarted job;
- user cannot release a started job or another user's job;
- cancelled jobs cannot be claimed;
- manager can create a 7-day operator invite;
- invite can be used only once;
- expired/revoked invite cannot register;
- invite registration always creates `operator`, never `manager`;
- new user lands in user view;
- existing manager workflow and job execution tests continue to pass.

## Out of scope for this version

- manager assigning a job manually to a specific worker;
- multiple workers sharing one job;
- open public signup without an invitation;
- custom permissions per worker;
- invitation by automatic email/SMS delivery;
- changing a worker into a manager through the invite flow.
