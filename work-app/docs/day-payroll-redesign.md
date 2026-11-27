# Day-based work and payroll

Requested 2026-11-16. One paid workday (for example 08:00–15:00) contains multiple customer jobs with independent appointment times. Salary is calculated once per employee per workday, less the unpaid break. All members share the day's default hours; explicit individual exceptions remain possible. Adding staff (including a new payroll employee) immediately creates their daily time entry on save.

Navigation: work list on Home; no separate calendar. Hours has exactly two top-level views: Workers and Days. Worker drilldown shows earnings, payments and linked objects/days with edit links. Day drilldown edits the shared interval, crew and every object's appointment in one transaction.

Data: introduce manager-only work_days; link jobs and payroll_entries to the day, preserving all legacy entries without recalculating them during migration. Converting a legacy date is an explicit save with a before/after wage preview. Store the original legacy rows in a manager-only audit record before consolidating. Preserve historical rates; reject consolidation of mixed rates for the same worker instead of silently replacing them. Keep payments untouched.

Save contract: optimistic versions for the day, all date jobs and all date payroll entries; date-level transaction lock; atomic day/jobs/crew updates; preserve pricing/source metadata and payroll note/site labels. Reject stale sets, overlaps with adjacent dates, invalid schedules or missing/archived people. New employees use stable client IDs and are saved atomically with the day. Old mutation endpoints must not bypass the managed day's consistency.

Verification: real Postgres-compatible migration tests, permission tests, stale-version and rollback tests, wage deduplication for multiple objects, historical-rate/payment preservation, relevant existing suites, production build and mobile browser QA with synthetic fixtures. Deploy schema before app and verify production deployment.
