# Confirmed booking sync design

## Goal

A website booking that has been confirmed must appear in the work app exactly once, carrying the booking reference (for example `AT-10`), planned date/time, object/address, estimated hours/work type when available, and estimated price.

## Current state

The public website sends booking and confirmation emails through Resend. The work app stores jobs in Supabase but has no external booking reference or import endpoint. The current public website deployment source is not present in the repository branches currently visible to the GitHub integration, so the app-side contract must be implementable independently and the website hook can be connected once that deployment source is recovered.

## Data model

Add nullable `source` and `external_ref` columns to `public.jobs` and a unique partial index on `(source, external_ref)` where both values are non-null. Website bookings use `source = 'website'` and `external_ref = 'AT-N'`. This makes retries idempotent.

## Import contract

Create a small parser/normalizer for the confirmed-booking payload. The normalized record contains:

- `externalRef` — required, uppercase `AT-<number>`
- `plannedDate` — required ISO date `YYYY-MM-DD`
- `plannedTime` — optional `HH:MM`
- `objectName` — optional
- `address` — optional
- `workType` — optional descriptive text
- `estimatedHours` — optional positive number, default 2
- `estimatedTotal` — optional non-negative number
- `description` — optional

Create a Supabase Edge Function `booking-confirmed` that accepts only authenticated webhook calls using a shared integration secret and upserts a `jobs` row by `(source, external_ref)`. Imported bookings use status `kinnitatud`, no operator, and preserve any existing app-side fields on retry unless the incoming booking explicitly supplies the corresponding booking field.

## Security

The public endpoint must not allow anonymous arbitrary job creation. Authentication is a constant-time comparison of a bearer token/shared integration secret. The secret is runtime configuration and is never committed to GitHub.

## Email compatibility

Add a pure parser for the current Estonian confirmation/request email format so a future Gmail/Resend bridge can feed the same normalized contract without changing database logic. The parser must tolerate missing optional `Töö:` details in older confirmations and join data from request + confirmation messages by the `AT-N` reference.

## Rollout

1. Add tests and parser.
2. Add migration for idempotent external references.
3. Add Edge Function and unit-testable normalization/auth helpers.
4. Apply migration and deploy the function only after tests pass.
5. Connect the website confirmation backend when its currently deployed source/config is located.
6. Do not backfill obvious test bookings automatically; only future confirmed bookings or explicitly selected historical bookings should be imported.
