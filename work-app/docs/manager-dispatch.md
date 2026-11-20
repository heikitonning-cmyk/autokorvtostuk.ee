# Manager dispatch and job shortcuts

The manager dashboard cards link to the corresponding filtered job list, using the same data as their displayed counts and revenue. Free-capacity days open that day's work list with a date-prefilled new-job shortcut. Existing active/history/all views remain available.

Managers select an active operator (or themselves) on the new-job form. Existing active jobs have a dedicated “Määra juht” control on their detail page. Assignment supports reassignment/removal, validates the target account, and rejects stale edits using `updated_at`. Existing assignments remain intact.

Operators no longer have self-service claim/release controls. Both legacy RPCs have their client execution rights revoked, and a database trigger enforces manager-only assignment even through direct writes. Assigned operators retain work start/finish and the existing shared planning view.

“Helista tellijale” appears beside navigation on manager/worker job details and route stops. It uses the booking-specific phone, falling back to the customer card, and disables the control when no valid phone is stored. Telephone punctuation is normalized; no country code is guessed.

Deploy `20261107073322_manager_job_assignment.sql` before the app version. Verification includes real PostgreSQL migration tests for assignment permissions, stale updates, inactive accounts and closed jobs, dashboard subset tests, phone normalization, and UI checks. No real jobs need reassignment for deployment.
