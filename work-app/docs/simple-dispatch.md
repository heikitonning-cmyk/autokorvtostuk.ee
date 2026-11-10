# Compact dispatch and chat entry

The manager adds address, scheduled date/time, contact phone, description and a payroll employee as driver. Saved Neste sites stay hidden until the address-book filter is enabled. Drivers use a shared read-only work plan with navigation and call links. Legacy photos, stops, pricing and completed work remain in the database; the old driver edit/finish pages redirect to the work detail.

Driver wages are separate from the scheduled appointment. An optional explicit payroll block records departure, finish, date, overnight flag and unpaid break. It creates one `payroll_entries` row linked by `job_id`. Later corrections update that row, preserving the historical rate for the same employee. Payroll overlap constraints and optimistic versions apply. Deleting a job unlinks, rather than deletes, its wage record. A linked entry can also be corrected through the existing payroll screen.

## Entering jobs from an authorized chat

Suggested conversation title: **Euro Kapital – tööde lisamine**.

User input can be plain Estonian, for example (fictional):

> Lisa töö: Näidistee 2, 12.11 kell 10.00, telefon 5551234, juht [töötaja nimi], rennide puhastus. Juhi tööaeg 07.30–16.00, paus 30 min.

Missing paid hours must stay missing: never infer departure from the appointment, scheduled duration from wages, or a finished shift from an unknown end. Employee identity must be resolved against active `payroll_employees`, not `users`. Ask only if identity/date is ambiguous or essential information is missing. Check likely duplicates by address and date before creation. Do not publish job or wage details outside the existing private app/database.

Use the existing authenticated manager session and the same atomic RPC as the web form:

`save_simple_job(p_job_id, p_expected_updated_at, p_job, p_payroll, p_expected_entry_updated_at)`

- New work: generate one UUID and retain it for retries; both expected versions are null.
- `p_job` contains `address`, `planned_date` (YYYY-MM-DD), `planned_time` (HH:MM), `contact_phone`, `description`, `driver_employee_id`, `site_id`, `customer_id`. Empty optional strings are accepted.
- `p_payroll` is null unless the user explicitly provides the completed driver time. Otherwise it contains `work_date`, `start_minute`, `end_minute`, `next_day`, `break_minutes`.
- Edits must first fetch current job and linked entry versions. Do not silently retry stale writes.
- The RPC requires an active application manager and uses invoker security/RLS. Do not add public access, invent identities or create credentials to support chat entry. If the connected admin database tool is used, retain the verified requesting manager as the actor through the project's established session context.
- Verify the returned job and, when provided, its wage entry; return the job URL and short saved summary. A separate chat does not create an automation or proactively monitor messages.

## Deployment and verification

Apply `20261110095155_simple_dispatch.sql` before deploying the new app routes. The migration is additive and leaves existing bookings and payroll entries unchanged. Existing booking ingestion keeps its old columns and functions.

Validation: actual PostgreSQL migration tests (PGlite) cover no automatic wages, separate departure, exact creation retries, atomic overlap rollback, stale versions, historical rates, employee reassignment, preserved booking/pricing metadata, overnight shifts, archived employees, wage retention after job deletion and operator/anonymous restrictions. UI checks cover hidden Neste sites, payroll driver selection, 07:30–16:00 less 30 minutes = 8 hours, call/navigation URLs, mobile layout and preservation of every field after a failed submission.
