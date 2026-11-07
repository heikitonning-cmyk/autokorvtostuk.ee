# Tunnid ja palgad

Manager-only `/manager/time` extends the existing Euro Kapital work app. It has manual time entry, independent employees with hourly rates, existing customer sites, and monthly employee/site summaries. It does not calculate taxes or change customer billing, lift job pricing, or operator surcharges. Employees do not need login accounts.

## Calculation and history

- Store local calendar date, whole start/end minutes, an explicit next-day flag, and an unpaid break. Shifts must be positive and at most 24 hours; the break must be shorter than the shift.
- Work across midnight belongs to its start date/month. These are entered wall-clock hours, including dates with daylight-saving changes.
- Store rates in integer cents. The database captures the employee rate for each new record, rounds each wage to the nearest cent, and computes paid minutes and wages itself.
- Changing an employee's current rate never rewrites past entries. Time/note/site edits retain the saved rate. Choosing a different employee captures that employee's current rate.
- Archive employees instead of deleting history. Referenced sites cannot be deleted. PostgreSQL exclusion constraints reject duplicate and overlapping entries for the same employee, including across midnight.
- Entry updates/deletes and employee edits compare their original `updated_at` value to avoid overwriting an intervening change. Employee forms retain their draft version through unrelated page refreshes.
- All reference and monthly reads use pagination. Failed reads show an error rather than misleading zero totals.

## Access

Both tables have RLS and use the existing `private.is_manager()` role helper. Operators, inactive managers and anonymous users cannot read wages. Server actions independently require an active manager. No service-role client or elevated RPC is introduced.

## Release sequence

1. Confirm live schema matches the app branch's existing customer site and private helper migrations.
2. Apply `supabase/migrations/20261107052811_employee_time_wages.sql` to the existing project. It adds two tables and the `btree_gist` extension; no existing business rows are changed.
3. Deploy `work-app` from the tested commit to the existing app project.
4. Check with a manager: create a test employee, choose an existing site, enter 08:00–17:00 with 30 minutes lunch at €12.50 → 8h30 and €106.25. Confirm the monthly employee and site totals, edit/delete, change rate and inspect an old record.
5. Verify an operator cannot access `/manager/time` or read either payroll table. Remove the test entry and archive the test employee.

Automated validation: `npm test`, `npm run typecheck`, `npm run build`, `npm run build:cf`. `tests/payroll-db.test.ts` applies the actual migration in an isolated PostgreSQL engine with the app's actual role helpers and checks calculations, rate history, overlaps, archived employees, RLS and anonymous access. It does not connect to production.

UI smoke validation uses the actual client components with synthetic employees/sites and mocked server actions: mobile/desktop layouts, live wage preview, explicit overnight entry, retaining fields after a failed save, retaining drafts across tabs, employee/site filters, and historical-rate editing. Live authentication, saving and deployment must still be checked after the migration is installed.

The source change can be rolled back independently; leave payroll tables in place to preserve entered data.
