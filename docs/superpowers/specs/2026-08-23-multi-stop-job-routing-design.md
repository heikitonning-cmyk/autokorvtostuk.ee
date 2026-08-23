# Multi-stop job and route design

Date: 2026-08-23
Status: Proposed for user review
Branch: `app-v1-build`
Parent architecture: `2026-08-23-lift-workflow-platform-design.md`

## 1. Purpose

Extend the existing work app so one job can contain many ordered stops. The primary use case is a Neste maintenance workday where 5 or more stations are completed in sequence, but the model must work for any customer and must not impose an application-level stop-count limit.

The flow must make it fast to find and select many saved customer sites, optimize the driving order only when requested, navigate each next stop in Waze, record stop-specific work, and add more stops during the day.

## 2. Approved operating rules

- One `job` can contain zero, one, or many `job_stops`.
- Existing jobs without `job_stops` remain valid and continue using the current single-location flow.
- New multi-stop jobs use `job_stops` as the operational source of truth for route order and stop completion.
- The same customer site may be added to the same job more than once. Each occurrence is a separate stop.
- There is no application-level maximum number of stops.
- Default route is `Luige -> stops -> Luige`.
- Manager (`Juht`) and operator (`Kasutaja`) can change the route start and end locations for a specific job.
- Manager and operator can reorder unfinished stops, including during active work.
- Route optimization never runs automatically. It runs only after the user presses an optimization button.
- The optimization objective is the fastest driving order, not minimum distance.
- After optimization, the user can still reorder stops manually.
- During active work, `Optimeeri ülejäänud marsruut` may reorder only pending stops. Completed, skipped, and currently active stops are not moved.
- Waze is the navigation target. The app owns the route sequence and sends only the current/next stop to Waze.
- New stops can be added while the job is active. They are appended to the unfinished route by default and may then be manually reordered or included in a new remaining-route optimization.
- Each stop has its own actual start and end time.
- Each stop can have an optional stop-specific work description in addition to the job-level general description.
- A stop marked `Tehtud` requires a non-empty completion note and at least one stop photo.
- A stop marked `Jäta vahele` requires a non-empty completion note; photo is optional.
- A job can be completed only when every stop is in a terminal state: `Tehtud` or `Vahele jäetud`.

## 3. Architecture choice

Use an additive child-table model rather than JSON inside `jobs` and rather than introducing a separate workday/route subsystem now.

`jobs` remains the job/workday header. `job_stops` is an ordered set of operational children. This preserves the existing job model, keeps each stop independently queryable and auditable, supports stop-specific time/photos/notes, and leaves room for later invoice/payroll/reporting without redesigning stored JSON.

### Alternatives rejected

1. **Stops as JSON on `jobs`**: faster initially but poor for concurrent edits, audit, filtering, reporting, RLS, photos, and stop-level timing.
2. **Separate `work_days` / `routes` subsystem now**: flexible but unnecessarily expands scope. A job already represents the practical workday unit for this release.

## 4. Data model

### 4.1 `job_stops`

New table fields:

- `id uuid primary key`
- `job_id uuid not null references jobs(id) on delete cascade`
- `site_id uuid null references customer_sites(id)`
- `sequence_no integer not null`
- `name_snapshot text null`
- `address_snapshot text not null`
- `description text null`
- `status text not null default 'pending'`
  - allowed: `pending`, `in_progress`, `done`, `skipped`
- `actual_start timestamptz null`
- `actual_end timestamptz null`
- `completion_note text null`
- `completed_by uuid null references users(id)`
- `created_by uuid null references users(id)`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

`sequence_no` is unique only within a job after a reorder transaction. There is intentionally no uniqueness constraint on `(job_id, site_id)` because duplicate visits are allowed.

The stop stores site name/address snapshots. Editing a saved customer site later must not silently rewrite historical job stops.

### 4.2 Route endpoints on `jobs`

Add route-level fields:

- `route_start_site_id uuid null`
- `route_start_address text null`
- `route_end_site_id uuid null`
- `route_end_address text null`

If a route endpoint is not explicitly set on a job, the UI resolves the configured company `base_location` whose display label is `Luige`. Optimization is disabled with a clear manager-facing configuration error if no usable base location exists.

### 4.3 Stop photos

Extend `job_photos` with nullable `job_stop_id`.

A stop-specific photo keeps the existing `job_id` and also stores `job_stop_id`. Enforce that the referenced stop belongs to the same job, preferably with a composite foreign-key-compatible uniqueness pair on `job_stops(id, job_id)`.

Existing job-level photos remain valid with `job_stop_id = null`.

## 5. Permissions and concurrency

The existing guarded unfinished-job edit model remains the security baseline.

Both active roles, manager and operator, may:

- add stops to an editable job;
- reorder pending stops;
- change job route start/end;
- optimize the route;
- start/finish/skip stops according to operational state rules.

Stop mutations must use guarded server actions/RPCs, not unrestricted client table writes. Reordering is atomic: the server receives the desired ordered stop IDs, verifies every ID belongs to the same job and is movable, then rewrites sequence values in one transaction.

Completed and skipped stops are immutable for route ordering. Historical corrections to their note/time are a separate manager correction action with audit logging, not part of ordinary drag-and-drop.

## 6. Creating and editing a multi-stop job

### 6.1 Fast site finder

For a selected customer, replace the long single-select experience with a dedicated `Lisa peatused` picker:

- search input: `Otsi nime, aadressi või linna...`;
- instant case-insensitive matching on saved site name, address, city, and county;
- compact rows such as `Pirita — Rummu tee 2, Tallinn`;
- checkbox/tap selection for many sites in one pass;
- filters derived from available city/county values rather than a hard-coded region list;
- selected section showing `Valitud N`;
- selected items can be reordered before insertion;
- button `Lisa N peatust tööle`.

Selecting the same saved site again is allowed after it has been added; duplicates are represented as separate `job_stops`.

A manual/new address can also be added as a stop without requiring it to become a permanent customer site, while the existing `+ Lisa uus asukoht` flow can still create reusable master data when desired.

### 6.2 Job header

A multi-stop job shows a job-level title/general description rather than treating one stop address as the whole job address. Example title: `Neste hooldus 24.08`.

The job screen shows:

- number of stops;
- route start/end;
- current ordered stop list;
- estimated route time and km when an optimization/route estimate exists;
- `Optimeeri marsruut` before/during planning;
- manual drag reorder;
- `+ Lisa peatus`.

Existing single-location jobs remain visually unchanged unless converted by adding stops.

## 7. Route optimization

### 7.1 User behavior

`Optimeeri marsruut` is explicit. It never silently changes order.

The app sends route start, route end, and movable stops to the optimization service. It returns a proposal containing:

- proposed stop order;
- estimated driving time;
- estimated km;
- comparison with the current order where both estimates are available.

The UI presents the proposal before applying it. The user chooses `Kasuta soovitust` or keeps the current order. After applying it, drag-and-drop remains enabled.

### 7.2 Active-job optimization

`Optimeeri ülejäänud marsruut` works only on remaining `pending` stops.

The effective origin is:

1. the current `in_progress` stop address, if a stop is active; otherwise
2. the most recently completed/skipped stop address, if work has already progressed; otherwise
3. the configured job route start.

The configured route end remains the destination. Done/skipped/current stops do not move.

### 7.3 Optimization service boundary

Keep optimization behind a server-side adapter so routing vendor details do not leak into UI or database logic.

Initial routing implementation uses Google Maps Platform routing/route-optimization services server-side to optimize for driving time and return distance/time estimates. Waze remains only the navigation deep link.

The app itself does not impose a stop-count limit. If the routing provider requires request batching, the adapter handles batching/server-side optimization transparently. Provider failure must never alter saved stop order: show an error and retain the current manual order.

API keys are server-only. Do not expose routing credentials to browser code.

## 8. Operational stop flow

For the operator, the active job emphasizes one stop at a time.

### Pending stop

Show:

- stop name;
- full address;
- stop-specific description, if any;
- `Navigeeri`;
- `Alusta peatust`.

`Navigeeri` opens Waze using the stop address.

### In-progress stop

`Alusta peatust` atomically sets:

- `status = in_progress`;
- `actual_start = now()`.

Only one stop in the same job may be `in_progress` at a time.

Show elapsed stop time, photo capture/upload, completion note, `Tehtud`, and `Jäta vahele`.

### Mark `Tehtud`

Server validation requires:

- stop is `in_progress`;
- trimmed completion note is non-empty;
- at least one `job_photos` row exists for this stop.

Then atomically set:

- `status = done`;
- `actual_end = now()`;
- `completion_note`;
- `completed_by = current user`.

### Mark `Jäta vahele`

Server validation requires a non-empty completion note. Photo is optional. The stop may be skipped from `pending` or `in_progress`.

Then set:

- `status = skipped`;
- `actual_end = now()`;
- `completion_note`;
- `completed_by = current user`.

If it was never started, `actual_start` may remain null.

### Next stop

After terminal completion, the UI advances to the first remaining pending stop by current sequence and presents `Navigeeri Waze'is`.

If no pending stop remains, the UI offers job completion.

## 9. Adding stops during the workday

`+ Lisa peatus` is available on an active editable job to both manager and operator.

The new stop is appended after the current unfinished sequence by default. Adding a stop never triggers optimization automatically.

After adding, the user can:

- leave it at the end;
- drag it elsewhere among pending stops;
- press `Optimeeri ülejäänud marsruut`.

Already done/skipped stops stay fixed.

## 10. Job completion rule

For a job with stops, the normal job completion action is blocked while any stop is `pending` or `in_progress`.

When every stop is `done` or `skipped`, the job may be completed through the existing finish flow. Job-level actual totals and later Neste accounting can aggregate stop times and route data without losing the individual stop records.

A multi-stop job with zero stops is invalid for route execution, but existing legacy jobs with no `job_stops` continue using their current single-location finish rules.

## 11. Audit and history

Create job events for at least:

- stops added;
- stop order changed;
- route optimization proposal applied;
- route endpoints changed;
- stop started;
- stop completed;
- stop skipped;
- stop added during active work.

Events record actor, job, relevant stop IDs, timestamp, and before/after order when useful.

## 12. Error handling

- Failed Waze opening does not alter any work state.
- Failed optimization retains the existing order.
- Failed reorder leaves the whole previous order intact; no partial sequence update.
- A stop cannot be completed without the required note/photo validations.
- If another user changes the stop list while a reorder screen is stale, the server rejects the stale reorder and asks for refresh rather than overwriting newer state.
- A deleted/deactivated customer site does not invalidate an existing stop because the stop has address/name snapshots.

## 13. Testing requirements

Use TDD for implementation.

Minimum automated coverage:

- migration creates `job_stops`, route endpoint fields, and stop-photo relation;
- duplicate `site_id` stops in one job are allowed;
- site picker search matches name/address/city/county;
- multiple selected sites create the correct ordered stops;
- manual stop addition works during an active job;
- reorder is atomic and cannot move terminal stops in remaining-route mode;
- both manager and operator can reorder permitted stops;
- route optimization is explicit and never auto-applies;
- optimization failure preserves order;
- Waze link targets the current/next stop;
- only one stop can be `in_progress` per job;
- `done` rejects empty note;
- `done` rejects zero stop photos;
- `skipped` rejects empty note but permits zero photos;
- per-stop start/end timestamps are recorded;
- job completion rejects pending/in-progress stops;
- legacy single-location jobs continue to function.

Production verification must include a Neste smoke test with at least five station stops, manual reorder, explicit optimization, one stop completed, one stop skipped, another stop added during the active job, remaining-route re-optimization, and Waze deep-link verification.

## 14. Delivery scope

This design covers the multi-stop operational foundation only. It deliberately does not yet implement:

- full Neste invoice calculation from route/stop data;
- wage calculation;
- automatic website inquiry conversion;
- live GPS tracking of employees;
- automatic background route re-optimization;
- mandatory photo classification beyond stop association.

Those later functions consume this stop-level data rather than changing the stop model.

## 15. Acceptance criteria

The feature is accepted when a manager can create one Neste job, find and select many stations quickly, preserve or manually set their order, optionally optimize for fastest route, and hand the job to a user who can navigate and execute each stop in Waze; both roles can add/reorder unfinished stops during the day; each stop records its own time and required completion evidence; skipped stops require a note but not a photo; and the job cannot finish until every stop has been resolved.