# Cloudflare Deploy + Google/OSRM Routing Fallback Design

**Date:** 2026-08-23

## Goal

Remove Vercel build-rate-limit and Google Routes API key as single points of failure for the work app. The application must remain deployable and the multi-stop workflow must remain usable even when Google routing is unavailable.

The target production behavior is:

`GitHub app-v1-build -> tests/typecheck/build -> Cloudflare Workers preview -> smoke test -> app.autokorvtostuk.ee`

and routing is:

`Google Routes (when configured and healthy) -> cached coordinates/Nominatim -> OSRM matrix + local optimizer -> manual stop ordering + Waze navigation`

The fallback must never block job execution.

## Scope

This design covers:

- deploying the existing Next.js work app to Cloudflare Workers with the OpenNext adapter;
- keeping Supabase as the existing production data/auth/storage backend;
- keeping Vercel as an optional secondary deployment path rather than a release blocker;
- adding persisted coordinates for customer sites and job-stop snapshots;
- adding a normalized address geocode cache for manual stops/endpoints and repeated addresses;
- server-side Nominatim geocoding with strict caching and policy compliance;
- server-side OSRM matrix routing using the existing deterministic nearest-neighbor + 2-opt optimizer;
- routing provider fallback and error handling;
- preview, smoke-test, domain cutover and rollback rules.

Out of scope:

- replacing Supabase;
- live vehicle GPS tracking;
- turn-by-turn navigation inside the work app;
- replacing Waze as the driver's navigation app;
- self-hosting Nominatim or OSRM in this release;
- changing public-site hosting at autokorvtostuk.ee;
- merging app-v1-build into main without explicit approval.

## Existing State

The app is Next.js 16 App Router with React Server Components, Server Actions, route handlers and Supabase. Multi-stop jobs, per-stop execution, Waze navigation, manual ordering and explicit Google route proposals already exist on `app-v1-build`.

Production Supabase already contains the multi-stop schema and guarded mutation RPCs. This project must reuse that data model and must not recreate or migrate the database to a new provider.

The current Vercel Git integration is blocked by a Hobby-plan build-rate-limit. The code itself has passed GitHub Actions tests, TypeScript checks and Next.js builds. The new hosting path therefore removes deployment coupling rather than changing the application product model.

## 1. Hosting Architecture

### 1.1 Cloudflare Workers

The full-stack Next.js application will deploy to Cloudflare Workers through `@opennextjs/cloudflare` and Wrangler.

Required repository configuration:

- `@opennextjs/cloudflare` dependency;
- `wrangler` development dependency;
- `wrangler.jsonc` with `.open-next/worker.js`, `.open-next/assets`, `nodejs_compat` and a current compatibility date;
- `open-next.config.ts`;
- package scripts for `preview`, `deploy` and optional `cf-typegen`.

Cloudflare's current Next.js Workers documentation explicitly supports App Router, React Server Components, SSR, route handlers and Server Actions with the OpenNext adapter. Production-runtime validation must use the Workers preview path because Cloudflare runs the deployed app in `workerd`, not the local Node development runtime.

### 1.2 Environment variables

The Cloudflare deployment receives the same Supabase public configuration used by the existing app:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Optional/private routing configuration:

- `GOOGLE_MAPS_ROUTES_API_KEY` — optional; never public;
- `NOMINATIM_BASE_URL` — default `https://nominatim.openstreetmap.org`;
- `OSRM_BASE_URL` — default `https://router.project-osrm.org`;
- `ROUTING_USER_AGENT` — identifies the application for Nominatim requests and includes a maintained contact route.

Secrets must never use a `NEXT_PUBLIC_` prefix.

### 1.3 Deployment ownership

Cloudflare becomes the primary deploy path for `app-v1-build`. Vercel is not deleted and can remain an independent secondary path. A Vercel quota failure must not affect Cloudflare deployment or application runtime.

No production custom-domain change is made until a Workers preview passes the smoke test.

## 2. Coordinate Data Model

OSRM consumes longitude/latitude coordinates, not free-form addresses. Geocoding results must therefore be persisted and reused rather than requested repeatedly.

### 2.1 Customer sites

Add nullable columns to `customer_sites`:

- `latitude double precision`
- `longitude double precision`
- `geocoded_at timestamptz`
- `geocode_source text`
- `geocode_address_snapshot text`

Coordinates represent the currently saved site address. If a site's address changes, the old coordinate cache is invalidated before the new address is treated as geocoded.

### 2.2 Job stops

Add nullable snapshot columns to `job_stops`:

- `latitude_snapshot double precision`
- `longitude_snapshot double precision`

When a stop is created from a saved customer site and valid cached coordinates exist, copy them to the job-stop snapshot. Historical jobs therefore remain stable if a customer site's address or coordinates later change.

A one-off manual stop may initially have null coordinates. It is resolved through the generic geocode cache and the successful result is then copied to the job-stop snapshot.

### 2.3 Generic geocode cache

Add `geocode_cache` for addresses that are not naturally persisted as customer sites, including manual route endpoints and repeated one-off addresses.

Required fields:

- `normalized_address text primary key`
- `address_snapshot text not null`
- `latitude double precision not null`
- `longitude double precision not null`
- `source text not null`
- `geocoded_at timestamptz not null default now()`

Address normalization is deterministic and server-side: trim, collapse whitespace, lowercase for the cache key, while retaining the human-readable snapshot separately.

Resolution order for any routing address is:

1. valid saved customer-site coordinates when a site is known;
2. job-stop snapshot coordinates when the stop already has them;
3. `geocode_cache` by normalized address;
4. one rate-limited Nominatim request, then persist to `geocode_cache` and copy to the owning row where applicable;
5. if geocoding fails, optimization is unavailable but manual order and Waze remain available.

The Luige base address uses the same cache path and should be pre-cached during the one-time bootstrap so normal route optimization never needs to geocode Luige repeatedly.

## 3. Nominatim Geocoding

### 3.1 Deliberate low-volume use

The public OpenStreetMap Nominatim endpoint is used only as a low-volume server-side fallback geocoder for this specific work application. It is not exposed as a generic search/autocomplete API.

The implementation must comply with the public Nominatim usage policy:

- absolute maximum one request per second;
- one server-side request stream, not distributed parallel geocoding;
- identifying `User-Agent` or Referer, not a stock HTTP-library user agent;
- OSM attribution displayed in the application where fallback geocoding/routing is used;
- results cached locally;
- repeated identical addresses must not repeatedly hit the public service;
- no client-side autocomplete backed by the public Nominatim endpoint;
- one-time bootstrap/backfill geocoding must be serialized on one worker/process and rate-limited.

The server adapter must inject a sleep/rate limiter and must be testable with fake fetch/sleep implementations.

### 3.2 Query behavior

Input is a normalized Estonian address string. Requests use `format=jsonv2`, `limit=1`, Estonia country filtering/bias where supported, and an identifying user agent.

A successful response must contain finite latitude and longitude values. Empty/ambiguous/provider-error results are treated as geocoding failure; no invented coordinates are stored.

### 3.3 Cache behavior

For saved customer sites:

- if `latitude`, `longitude` and `geocode_address_snapshot === current address` are present, do not call Nominatim;
- otherwise check `geocode_cache`;
- only on cache miss call Nominatim, then persist both the generic cache and site coordinates.

For job stops:

- if snapshot coordinates are present, use them directly;
- otherwise check `geocode_cache` for `address_snapshot`;
- only on cache miss call Nominatim, then persist the generic cache and job-stop snapshot.

For manual route endpoints:

- always check `geocode_cache` first;
- only a cache miss may call Nominatim.

This makes the 59 known Neste stations a mostly one-time geocoding cost rather than a per-route cost. A one-time serialized bootstrap may pre-geocode the known station addresses and Luige, at no more than one Nominatim request per second.

## 4. OSRM Routing Fallback

### 4.1 Why Table + local optimizer

The existing app already has a deterministic fixed-endpoint nearest-neighbor + 2-opt optimizer. OSRM's Table service returns fastest-route durations/distances between supplied coordinates and therefore fits that existing abstraction cleanly.

We do not depend on OSRM Trip ordering as the primary algorithm because the official OSRM documentation states that Trip uses an approximation for larger waypoint sets and the returned path does not have to be the fastest one.

### 4.2 OSRM adapter

Create a provider-independent OSRM adapter that:

1. receives resolved route points with stable IDs, longitude and latitude;
2. requests OSRM `/table/v1/driving/...` with `annotations=duration,distance`;
3. maps response matrix cells back to stable point IDs;
4. rejects `null`/unroutable matrix cells rather than inventing a cost;
5. builds current-route metrics from the same matrix;
6. uses the existing deterministic `optimizeFixedEndpoints` function for the proposal;
7. returns the existing `RouteOptimizationResult` shape with source `osrm-matrix`.

For large jobs, the adapter chunks source/destination groups so a single public-demo request is not excessive and URL lengths remain controlled. Chunk size is an implementation constant covered by tests, not a user-visible stop limit.

There is no application-level stop-count limit.

### 4.3 Public demo dependency

`router.project-osrm.org` is a public demo/best-effort endpoint and has no production SLA promised to this application. Therefore:

- its base URL is configurable;
- provider failures are expected and non-destructive;
- later migration to a self-hosted or commercial OSRM-compatible endpoint requires no UI/data-model redesign;
- a failed OSRM call never changes persisted stop order.

## 5. Routing Provider Selection

The route proposal action becomes provider-aware.

### 5.1 Normal order

When Google is configured:

1. try Google Routes optimization;
2. if Google succeeds, return the Google proposal;
3. if Google fails because of provider/network/quota/runtime error, resolve coordinates and try OSRM fallback;
4. if OSRM succeeds, return the OSRM proposal;
5. if both fail, return a stable non-destructive routing error.

When Google is not configured:

1. resolve coordinates from saved snapshots/cache/Nominatim;
2. use OSRM directly;
3. if geocoding or OSRM fails, leave manual order unchanged.

### 5.2 User-visible source and attribution

The UI shows a compact result label:

- `Liiklusinfoga` for Google;
- `Tavapärase sõiduaja järgi` for OSRM.

When OSM/Nominatim/OSRM fallback is used, the proposal panel also displays a compact attribution such as `Andmed © OpenStreetMap contributors`.

The user does not need provider names to understand the operational difference.

### 5.3 Manual-control invariant

Provider fallback preserves the already-approved manual-control rules:

- optimization runs only after explicit button press;
- calculation returns a proposal only;
- no provider automatically writes the route order;
- only `Kasuta soovitust` calls the guarded reorder RPC;
- `Jäta praegune järjekord` leaves the DB unchanged;
- manual drag/reorder remains available after applying a suggestion;
- active work only optimizes pending stops; done/skipped/in-progress stops remain fixed.

## 6. Failure Handling

Routing is optional operational assistance, never a prerequisite for doing the job.

Failure hierarchy:

1. Google unavailable -> try OSRM;
2. missing coordinates -> use saved values/cache or rate-limited Nominatim;
3. Nominatim unavailable/rate-limited/no result -> do not optimize that route;
4. OSRM unavailable/unroutable -> do not optimize;
5. manual order + Waze remains fully usable.

Stable UI copy distinguishes:

- fallback route successfully calculated without live traffic;
- address could not be located;
- routing service temporarily unavailable;
- stale route revision requiring refresh.

No failed provider path may invoke `reorder_job_stops`.

## 7. Cloudflare Preview, Cutover and Rollback

### 7.1 Pre-deploy verification

Before every Cloudflare deployment candidate:

- `npm test`
- `npm run typecheck`
- `npm run build`
- OpenNext/Workers preview build

All must pass on the exact candidate tree.

### 7.2 Preview smoke test

Deploy first to a `*.workers.dev` hostname and verify at least:

- login and role switching;
- manager and worker pages;
- Supabase reads/writes;
- job creation;
- 5 saved Neste stops;
- duplicate saved station occurrence;
- manual stop addition;
- drag reorder;
- OSRM route proposal without Google key;
- `Jäta praegune järjekord` leaves DB order unchanged;
- `Kasuta soovitust` changes only pending stop order;
- start a workday and one stop;
- finish one stop with note + photo;
- skip one with note;
- add a new stop during active work;
- optimize remaining pending stops;
- Waze opens the next address;
- manager stop correction/audit;
- legacy single-address job still works.

Test data must be explicitly marked and removed/rolled back after the smoke test.

### 7.3 Production domain cutover

Only after the preview smoke test passes:

- bind `app.autokorvtostuk.ee` to the Cloudflare Worker;
- verify TLS and login on the custom domain;
- verify one read-only production job view and one reversible test mutation;
- retain the previous deployment/DNS target until the new custom-domain check passes.

### 7.4 Rollback

If the custom-domain validation fails:

- revert the route/domain to the previous known-good target;
- do not roll back Supabase data/schema merely because hosting failed;
- investigate Cloudflare/runtime compatibility in preview;
- manual work operation remains available through the last known-good deployed app.

## 8. Security and Privacy

- Supabase RLS remains the authorization boundary.
- Google API key remains server-only.
- Nominatim and OSRM calls happen server-side; browser clients do not receive private routing config.
- Geocoder requests contain only routing addresses needed to calculate the route; no customer phone/email or job notes are sent.
- Coordinates and geocode cache rows in Supabase are accessible only through server-side routing logic or appropriate authenticated/RLS paths; they are not exposed as a public location directory.
- Cloudflare secrets are configured outside Git and never committed.

## 9. Testing Strategy

Every implementation task follows TDD.

Required unit tests:

- address normalization is deterministic;
- Nominatim request headers, country/address mapping, 1 req/s limiter and invalid-response handling;
- generic cache hit bypasses Nominatim;
- customer-site cache hit bypasses Nominatim;
- address change invalidates saved site coordinates;
- manual route endpoint uses generic cache;
- OSRM Table request/response mapping;
- null/unroutable matrix rejection;
- duplicate job stops remain separate by stable ID even when coordinates match;
- current/proposed metrics use the same OSRM matrix;
- Google success does not call OSRM;
- missing Google key calls OSRM;
- Google failure calls OSRM;
- Google + OSRM failure produces no reorder mutation;
- proposal/apply separation remains enforced;
- active remaining-route fixed-stop behavior remains enforced.

Required integration/acceptance tests:

- Cloudflare configuration files/scripts exist;
- no `NEXT_PUBLIC_` routing secrets;
- manual Waze fallback remains present;
- OSM attribution is present when fallback result is displayed;
- UI distinguishes traffic-aware vs ordinary-time fallback;
- existing multi-stop acceptance tests remain green.

## 10. Operational Constraints

- Work only in `app-v1-build` until the user explicitly approves integration elsewhere.
- Do not make `main` the implementation target.
- Do not point `app.autokorvtostuk.ee` to Cloudflare before preview smoke passes.
- Do not depend on Vercel becoming available.
- Do not make Google configuration mandatory.
- Do not make public Nominatim or OSRM availability mandatory for job execution.
- Do not add address autocomplete to the public Nominatim service.
- Cache geocoding results persistently and respect the Nominatim public usage policy.
- One-time Nominatim bootstrap/backfill is serialized, one process, no more than one request per second, and never becomes a recurring bulk job.

## 11. Success Criteria

The release is successful when:

1. the exact `app-v1-build` application can build and run in Cloudflare Workers/OpenNext;
2. Supabase production data/auth/storage work from the Workers runtime;
3. a multi-stop route can be optimized with no Google API key using cached/Nominatim coordinates + OSRM;
4. repeated known addresses do not cause repeated Nominatim requests;
5. Google remains preferred automatically when later configured;
6. provider failures never change route order and never stop workers doing jobs;
7. 5-stop Neste preview/live smoke passes;
8. `app.autokorvtostuk.ee` serves the verified Workers deployment;
9. Vercel build-rate-limit is no longer capable of blocking releases.

## References checked 2026-08-23

- Cloudflare Workers Next.js/OpenNext guide: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- Cloudflare existing-project automatic configuration: https://developers.cloudflare.com/workers/framework-guides/automatic-configuration/
- OSRM HTTP API / Table and Trip services: https://project-osrm.org/docs/v5.24.0/api/
- Nominatim public usage policy: https://operations.osmfoundation.org/policies/nominatim/
