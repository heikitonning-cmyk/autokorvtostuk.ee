# Tunnid ja palgad

Manager-only `/manager/time` provides worker-first time and wage tracking. Employees do not need login accounts. It does not calculate taxes or affect customer billing, lift jobs, or operator surcharges.

## Workflow

- Select one or several employees. Enter a common date, start, end and optional unpaid lunch, or use **Alusta kohe** to start timers at the current server time in Europe/Tallinn.
- Choose zero, one or multiple existing sites as informational labels. Labels never allocate or duplicate hours/wages. Monthly totals group by employee; the optional site filter shows complete matching records.
- **Praegu tööl** loads all running entries regardless of the selected month. Timers live in the database, survive closing the app, and refresh on focus/every minute. Stop one employee directly or select several and enter a common optional break.
- A batch saves or finishes in one transaction: if any worker has an invalid or overlapping record, the entire operation rolls back. Each worker uses their own rate, captured when the record starts/is inserted.
- Finished entries can be edited/deleted. A running entry can be corrected and completed manually when the clock was left running. Shifts must be 1 minute–24 hours and breaks shorter than elapsed time. Same-minute stops produce an explanatory error, not phantom paid time.

## Calculation and history

- Store calendar date and whole start/end minutes; a NULL end denotes running work and generates NULL paid minutes/wages until finished. The existing exclusion constraint covers open-ended intervals and rejects overlaps even across midnight. An additional unique index allows at most one running entry per worker.
- Current server clock is truncated to the minute once per batch. Manual and live shifts follow the existing Tallinn wall-clock convention, including DST dates. Overnight work belongs to its start month. Timers exceeding 24 hours require manual correction.
- Rates use integer cents. The database computes pay, rounded per finished entry. Changing an employee's current rate does not rewrite previous or running entries. Changing the employee on an existing entry captures the new worker's rate.
- Version checks prevent overwriting intervening changes or stopping an already-finished entry. Batch finish locks records in a deterministic order.
- Archived employees and historical site labels remain available in history. Existing site links are backfilled. The legacy `site_id` column and primary-site trigger keep old single-site clients compatible.

## Access and release

All payroll tables use RLS and `private.is_manager()`. The two batch RPCs are SECURITY INVOKER, explicitly check the active manager role and revoke anonymous/public execution. Server actions independently require an active manager. No service-role browser client or elevated RPC is used.

Apply `20261107061650_worker_first_payroll.sql` after `20261107052811_employee_time_wages.sql`, then deploy `work-app`. The migration preserves existing employees, entries, rates and site links. Leave the schema in place if rolling back application code to preserve history (old UI cannot edit running/multi-site entries safely).

Validation: `npm test`, `npm run typecheck`, `npm run build`. Isolated PostgreSQL tests apply the actual migrations and check optional/multiple sites, batch atomicity, start/finish, rate history, stale updates, duplicates, duration limits, and manager/operator/anonymous access. Browser QA uses the actual client components with synthetic data and failed server actions to verify interaction, previews, drafts and responsive layout; production UI and live-database smoke checks follow deployment.

## Recorded wage payments

**Maksed** records an employee, actual payment date, amount and optional note. It records a completed payment; no banking service is involved. Dates cannot be in the future and amounts must be positive, with at most two decimal places. The amount is stored in integer cents.

Whole-history balances aggregate finished wages and non-cancelled payments separately: earned minus paid. A November payment therefore settles unpaid October wages without selecting a wage month. A negative balance is an advance; one employee's advance never offsets another's outstanding pay. The labelled balance section is independent of the month/site filters. The payment history itself is filtered by payment month and optionally employee.

Payments may be corrected with an optimistic version check. Cancellation preserves the original amount, employee and date with a cancellation timestamp, and automatically restores the balance. Cancelled payments cannot be edited or counted again. Client roles cannot hard-delete payment history. Archived employees can still receive their outstanding pay.

A stable draft UUID makes retries idempotent. Submitting the same ID with identical contents succeeds without adding another payment; different contents or a cancelled record return a conflict. The draft ID/version survive tab changes and background refreshes. A successful save navigates to the payment's month. Two intentional payments on the same day are allowed as separate drafts.

Apply `20261107063549_payroll_payments.sql` before deploying this update. The payment table uses the same active-manager RLS as wages. `save_payroll_payment` and `payroll_balances` use SECURITY INVOKER with no anonymous/public execution. No existing time entries or rates are migrated or overwritten.

The SQL tests cover cross-month settlement, partial payments, advances, aggregate accuracy with multiple wages/payments, request retries, corrections, cancellation, stale versions, archived employees, bounds and role access. Client calculation tests cover exact amounts, previews and independent employee balances.
