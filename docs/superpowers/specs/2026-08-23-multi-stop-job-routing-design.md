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

Database ordering is unique per job with a deferrable unique constraint on `(job_id, sequence_no)`, so a whole reorder can be applied atomically without exposing a partially renumbered route.

There is intentionally no uniqueness constraint on `(job_id, site_id)` because duplicate visits are allowed.

The stop stores site name/address snapshots. Editing a saved customer site later must not silently rewrite historical job stops.

### 4.2 Route endpoints on `jobs`

Add route-level fields:

- `route_start_site_id uuid null`
- `route_start_address text null`
- `route_end_site_id uuid null`
- `route_end_address text null`

If a route endpoint is not explicitly set on a job, the UI resolves the configured company `base_location` whose display label is `Luige`. Optimization is disabled with a clear manager-facing configuration error if no usable base location exists; manual ordering and Waze navigation still work.

### 4.3 Stop photos

Extend `job_photos` with nullable `job_stop_id`.

A stop-specific photo keeps the existing `job_id` and also stores `job_stop_id`. Enforce that the referenced stop belongs to the same job with a composite relationship using `job_stops(id, job_id)`.

Existing job-level photos remain valid with `job_stop_id = null`.

## 5. Permissions and concurrency

The existing guarded unfinished-job edit and assignee-only operational model remains the security baseline.

Both manager and operator may plan an editable job:

- add stops;
- reorder pending stops;
- change route start/end;
- request route optimization and apply a proposal.

Actual stop execution follows the same ownership guard as current operational job actions: the assigned operator may start, complete, or skip stops. A manager does not bypass assignment merely because the manager can edit the plan. Manager-only historical correction can be added as a separate audited action.

Stop mutations use guarded server actions/RPCs, not unrestricted client table writes. Reordering is atomic: the server receives the desired ordered stop IDs plus an expected route version, verifies that all IDs belong to the same job and are movable, and rewrites the sequence in one transaction.

The job carries a route revision/version counter. Every add/remove/reorder increments it. A stale reorder request is rejected rather than overwriting a newer route.

Completed and skipped stops are immutable for normal route ordering. Historical corrections to their note/time use a separate manager correction action with audit logging.

## 6. Creating and editing a multi-stop job

### 6.1 Fast site finder

For a selected customer, use a dedicated `Lisa peatused` picker instead of a long single-select:

- search input: `Otsi nime, aadressi või linna...`;
- instant case-insensitive matching on saved site name, address, city, and county;
- compact rows such as `Pirita — Rummu tee 2, Tallinn`;
- checkbox/tap selection for many sites in one pass;
- filters derived from available city/county values rather than a hard-coded region list;
- selected section showing `Valitud N`;
- selected items can be reordered before insertion;
- button `Lisa N peatust tööle`.

Selecting the same saved site again is allowed after it has been added; duplicates are separate `job_stops`.

A manual/new address can also be added as a stop without requiring it to become a permanent customer site. The existing reusable-site creation flow remains available when desired.

### 6.2 Job header

A multi-stop job shows a job-level title/general description rather than treating one stop address as the whole job address. Example: `Neste hooldus 24.08`.

The job screen shows:

- number of stops;
- route start/end;
- current ordered stop list;
- estimated route time and km when an estimate exists;
- `Optimeeri marsruut`;
- manual drag reorder;
- `+ Lisa peatus`.

Existing single-location jobs remain visually unchanged unless stops are added.

## 7. Route optimization

### 7.1 User behavior

`Optimeeri marsruut` is explicit and never silently changes order.

The app sends route start, route end, and movable stops to the server-side optimization service. It returns a proposal containing:

- proposed stop order;
- estimated driving time;
- estimated km;
- comparison with current order when both estimates are available.

The UI shows the proposal before applying it. The user chooses `Kasuta soovitust` or keeps the current order. Manual reorder remains enabled after applying the proposal.

### 7.2 Active-job optimization

`Optimeeri ülejäänud marsruut` works only on remaining `pending` stops.

Effective origin is:

1. current `in_progress` stop address, if a stop is active;
2. otherwise the most recently resolved stop address, if work has progressed;
3. otherwise the configured job route start.

The configured route end remains the destination. Done, skipped, and current stops do not move.

### 7.3 Optimization service boundary

Keep optimization behind a server-side adapter so routing-vendor details do not leak into UI or database logic.

Initial implementation uses Google Maps Platform routing/route-optimization services server-side to optimize for driving time and return distance/time estimates. Waze remains only the navigation deep link.

The app itself does not impose a stop-count limit. Provider request-size limits are handled inside the adapter through supported batching/optimization strategy rather than by rejecting a normal workday because it has many stops.

Routing credentials are server-only. If routing credentials or the provider are unavailable, optimization returns a clear error and leaves the current order untouched. Manual order, stop execution, and Waze navigation continue to work.

## 8. Operational stop flow

The operator view emphasizes one stop at a time.

### Pending stop

Show:

- stop name;
- full address;
- stop-specific description, if any;
- `Navigeeri`;
- `Alusta peatust` for the assigned operator.

`Navigeeri` opens Waze using the stop address.

### In-progress stop

`Alusta peatust` atomically verifies assignment and that no other stop in the same job is active, then sets:

- `status = in_progress`;
- `actual_start = now()`.

Only one stop in the same job may be `in_progress` at a time. Enforce this in the database in addition to server validation.

Show elapsed stop time, photo capture/upload, completion note, `Tehtud`, and `Jäta vahele`.

### Mark `Tehtud`

Server validation requires:

- caller is the assigned operator;
- stop is `in_progress`;
- trimmed completion note is non-empty;
- at least one `job_photos` row exists for this stop.

Then atomically set:

- `status = done`;
- `actual_end = now()`;
- `completion_note`;
- `completed_by = current user`.

### Mark `Jäta vahele`

Server validation requires caller assignment and a non-empty completion note. Photo is optional. The stop may be skipped from `pending` or `in_progress`.

Then set:

- `status = skipped`;
- `actual_end = now()`;
- `completion_note`;
- `completed_by = current user`.

If it was never started, `actual_start` remains null.

### Next stop

After terminal completion, the UI advances to the first remaining pending stop by current sequence and presents `Navigeeri Waze'is`.

If no pending stop remains, the UI offers job completion.

## 9. Adding stops during the workday

`+ Lisa peatus` is available on an active editable job to manager and operator.

The new stop is appended to the unfinished route by default. Adding a stop never triggers optimization automatically.

After adding, the user can:

- leave it at the end;
- drag it elsewhere among pending stops;
- press `Optimeeri ülejäänud marsruut`.

Already done/skipped stops stay fixed.

## 10. Job completion rule

For a job with stops, normal job completion is blocked while any stop is `pending` or `in_progress`.

When every stop is `done` or `skipped`, the existing finish flow may complete the job. Later Neste accounting can aggregate stop times and route data without losing individual stop records.

A multi-stop job with zero stops is invalid for route execution, while legacy jobs with no `job_stops` continue using the current single-location rules.

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

Events record actor, job, relevant stop IDs, timestamp, and before/after route order where useful.

## 12. Error handling

- Failed Waze opening does not alter work state.
- Failed optimization retains the existing order.
- Failed reorder retains the whole previous order; no partial sequence update.
- A stop cannot be completed without required note/photo validation.
- A stale route revision is rejected and refreshed instead of overwriting newer changes.
- A deleted/deactivated customer site does not invalidate an existing stop because snapshots are stored.

## 13. Testing requirements

Use TDD for implementation.

Minimum automated coverage:

- migration creates `job_stops`, route endpoint fields, route revision, and stop-photo relation;
- duplicate `site_id` stops in one job are allowed;
- route sequence is unique and reorder is atomic;
- site picker search matches name/address/city/county;
- multiple selected sites create the correct ordered stops;
- manual stop addition works during an active job;
- stale route revisions are rejected;
- remaining-route reorder cannot move terminal/current stops;
- both manager and operator can perform permitted planning changes;
- only assigned operator can execute stop state transitions;
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

The feature is accepted when a manager can create one Neste job, find and select many stations quickly, preserve or manually set their order, optionally optimize for fastest route, and hand the job to the assigned user who can navigate and execute each stop in Waze; both roles can add/reorder unfinished stops during the day; each stop records its own time and required completion evidence; completed stops require a note plus at least one photo; skipped stops require a note but not a photo; and the job cannot finish until every stop has been resolved.