# Cloudflare + OSRM Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `app-v1-build` deployable independently of Vercel and make multi-stop route optimization work without a Google Routes API key, using persisted geocoding + OSRM while preserving manual ordering and Waze as guaranteed fallbacks.

**Architecture:** Keep the existing Next.js/Supabase app and explicit proposal/apply routing flow. Add persisted coordinates and a normalized geocode cache in Supabase, resolve cache misses through one globally serialized Cloudflare Durable Object that calls Nominatim at no more than 1 request/second, then use OSRM Table matrices plus the existing fixed-endpoint optimizer. Deploy the existing Next.js app to Cloudflare Workers through OpenNext; only move `app.autokorvtostuk.ee` after a `workers.dev` preview smoke test passes.

**Tech Stack:** Next.js 16.3.2, React 19.2.8, TypeScript 7.0.2, Supabase/PostgreSQL, `@opennextjs/cloudflare`, Wrangler 4.x, Cloudflare Workers + Durable Objects, Nominatim, OSRM Table API, existing Google Routes adapter, Waze navigation.

**Spec:** `docs/superpowers/specs/2026-08-23-cloudflare-osrm-fallback-design.md` plus `docs/superpowers/specs/2026-08-23-cloudflare-osrm-fallback-amendment.md`

## Global Constraints

- Work only on `app-v1-build`; do not modify or merge `main` without explicit user approval.
- Supabase remains the production auth/data/storage backend; do not move existing production data to Cloudflare.
- `GOOGLE_MAPS_ROUTES_API_KEY` is optional and server-only; never use `NEXT_PUBLIC_` for routing secrets.
- Routing order is `Google when configured/healthy -> cached coordinates/Nominatim -> OSRM -> manual order + Waze`.
- Routing calculation is proposal-only; only explicit `Kasuta soovitust` may call `reorder_job_stops`.
- Provider/geocoder failure must never block job execution or alter persisted stop order.
- Public Nominatim usage must be globally serialized to an absolute maximum of one request per second, identify the application, cache results and avoid autocomplete/bulk parallel requests.
- All Nominatim cache misses in Cloudflare production must pass through one Durable Object instance named `GeocodeThrottle` using the stable ID `global`.
- Public OSRM/Nominatim endpoints remain configurable and best-effort dependencies; no app-level stop-count limit is introduced.
- OSM attribution must be displayed when an OSRM/Nominatim fallback proposal is shown.
- `app.autokorvtostuk.ee` must not be moved to Cloudflare until the `workers.dev` preview smoke test passes.
- Use TDD for each code task: create RED evidence, implement minimal behavior, then verify GREEN with the full relevant suite.

---

## File Structure

New focused units:

- `work-app/supabase/migrations/20260823164000_routing_coordinates_cache.sql` — coordinate columns, generic cache, secure cache RPCs, address invalidation and stop-coordinate snapshot copy.
- `work-app/src/lib/routing/coordinates.ts` — shared coordinate types and deterministic address normalization.
- `work-app/src/lib/routing/geocode-store.ts` — Supabase RPC adapter for reading/writing persisted geocodes.
- `work-app/src/lib/routing/geocode.ts` — routing-point coordinate resolution; no direct Nominatim HTTP.
- `work-app/src/lib/routing/nominatim.ts` — pure Nominatim request construction/response parsing shared with the throttle Worker.
- `work-app/cloudflare/geocode-throttle/src/index.ts` — global Durable Object queue and Nominatim HTTP execution.
- `work-app/cloudflare/geocode-throttle/wrangler.jsonc` — external throttle Worker/DO declaration.
- `work-app/src/lib/routing/cloudflare-geocode.ts` — OpenNext binding adapter calling `GEOCODE_THROTTLE`.
- `work-app/src/lib/routing/osrm.ts` — OSRM Table chunking, matrix mapping and local route optimization.
- `work-app/src/lib/routing/provider.ts` — Google-first/OSRM-fallback orchestration.
- Existing `route-optimization-actions.ts` — resolves job route state and invokes provider orchestration; stays mutation-free during proposal.
- Existing `RouteOptimizationPanel.tsx` — source label, OSM attribution and stable fallback error copy.
- `work-app/wrangler.jsonc`, `work-app/open-next.config.ts`, `work-app/cloudflare-env.d.ts` — main Cloudflare Worker/OpenNext configuration.

---

### Task 1: Persist coordinates and secure geocode cache

**Files:**
- Create: `work-app/supabase/migrations/20260823164000_routing_coordinates_cache.sql`
- Modify: `work-app/tests/security.test.ts`
- Modify: `work-app/tests/acceptance.test.ts`

**Interfaces:**
- Produces RPC `public.get_cached_geocode(p_normalized_address text)` returning exactly `latitude, longitude` for one normalized key.
- Produces RPC `public.save_geocode_result(p_normalized_address text, p_address_snapshot text, p_latitude double precision, p_longitude double precision, p_site_id uuid default null, p_stop_id uuid default null)`.
- Adds `customer_sites.latitude`, `longitude`, `geocoded_at`, `geocode_source`, `geocode_address_snapshot`.
- Adds `job_stops.latitude_snapshot`, `longitude_snapshot`.
- Adds `geocode_cache(normalized_address primary key, address_snapshot, latitude, longitude, source, geocoded_at)`.

- [ ] **Step 1: Write failing schema/security acceptance tests**

Append assertions that the new migration exists and contains the exact cache columns, secure RPCs, coordinate bounds, address invalidation trigger and coordinate snapshot insertion path:

```ts
test('routing coordinate cache is persisted and only exposed through guarded RPCs', () => {
  const sql = readFileSync(resolve(root, 'supabase/migrations/20260823164000_routing_coordinates_cache.sql'), 'utf8')
  assert.match(sql, /create table public\.geocode_cache/i)
  assert.match(sql, /normalized_address text primary key/i)
  assert.match(sql, /latitude double precision/i)
  assert.match(sql, /longitude double precision/i)
  assert.match(sql, /get_cached_geocode/i)
  assert.match(sql, /save_geocode_result/i)
  assert.match(sql, /private\.current_app_role\(\).*operator.*manager/is)
  assert.match(sql, /enable row level security/i)
  assert.match(sql, /revoke all on table public\.geocode_cache from public/i)
  assert.match(sql, /geocode_address_snapshot/i)
  assert.match(sql, /latitude_snapshot/i)
  assert.match(sql, /longitude_snapshot/i)
})
```

- [ ] **Step 2: Run RED**

Run:

```bash
cd work-app
npm test
```

Expected: FAIL because `20260823164000_routing_coordinates_cache.sql` does not exist.

- [ ] **Step 3: Implement migration**

Create the migration with these schema statements and guards:

```sql
alter table public.customer_sites
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geocoded_at timestamptz,
  add column if not exists geocode_source text,
  add column if not exists geocode_address_snapshot text;

alter table public.job_stops
  add column if not exists latitude_snapshot double precision,
  add column if not exists longitude_snapshot double precision;

create table if not exists public.geocode_cache (
  normalized_address text primary key,
  address_snapshot text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  source text not null,
  geocoded_at timestamptz not null default now()
);

alter table public.geocode_cache enable row level security;
revoke all on table public.geocode_cache from public, anon, authenticated;
```

Add a `before update of address on public.customer_sites` trigger which clears all five geocode fields when `new.address is distinct from old.address`.

Create `get_cached_geocode` as `SECURITY DEFINER`, `search_path = public, private, pg_temp`, rejecting users unless `private.current_app_role() in ('operator','manager')`, and returning only the exact normalized key.

Create `save_geocode_result` with the same role guard plus:

```sql
if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
  raise exception 'invalid coordinates';
end if;

insert into public.geocode_cache(...)
values (..., 'nominatim', now())
on conflict (normalized_address) do update
set address_snapshot = excluded.address_snapshot,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    source = excluded.source,
    geocoded_at = excluded.geocoded_at;
```

When `p_site_id` is provided, update only that active `customer_sites` row and set `geocode_address_snapshot = address`. When `p_stop_id` is provided, update only that `job_stops` row and set the snapshot coordinates.

Recreate `add_job_stops(uuid,jsonb,bigint)` with its existing authorization/revision behavior, but when a saved site is selected read `latitude, longitude` alongside name/address and insert them into `latitude_snapshot, longitude_snapshot`. Manual stops insert null snapshots.

Revoke all public access and grant only RPC execution to `authenticated`.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
cd work-app
npm test
npm run typecheck
npm run build
```

Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add work-app/supabase/migrations/20260823164000_routing_coordinates_cache.sql work-app/tests/security.test.ts work-app/tests/acceptance.test.ts
git commit -m "feat: persist routing coordinate cache"
```

---

### Task 2: Build deterministic geocode resolution and Nominatim request logic

**Files:**
- Create: `work-app/src/lib/routing/coordinates.ts`
- Create: `work-app/src/lib/routing/coordinates.test.ts`
- Create: `work-app/src/lib/routing/nominatim.ts`
- Create: `work-app/src/lib/routing/nominatim.test.ts`
- Create: `work-app/src/lib/routing/geocode-store.ts`
- Create: `work-app/src/lib/routing/geocode.ts`
- Create: `work-app/src/lib/routing/geocode.test.ts`

**Interfaces:**

```ts
export type Coordinates = { latitude: number; longitude: number }
export type ResolvedRoutePoint = RoutePoint & Coordinates
export function normalizeAddress(address: string): string
export function buildNominatimSearch(address: string, baseUrl: string): URL
export function parseNominatimResult(payload: unknown): Coordinates | null
export type GeocodeGateway = (address: string) => Promise<Coordinates | null>
export async function resolveCoordinates(input: {
  point: RoutePoint
  siteId?: string | null
  stopId?: string | null
  snapshot?: Coordinates | null
  store: GeocodeStore
  geocode: GeocodeGateway
}): Promise<ResolvedRoutePoint>
```

- [ ] **Step 1: Write RED tests for normalization, request shape, cache-first behavior and invalid responses**

Use cases:

```ts
assert.equal(normalizeAddress('  Pärnu   mnt  10, Tallinn '), 'pärnu mnt 10, tallinn')
assert.equal(buildNominatimSearch('Tartu mnt 1, Tallinn', 'https://nominatim.openstreetmap.org').searchParams.get('countrycodes'), 'ee')
assert.deepEqual(parseNominatimResult([{ lat:'59.437', lon:'24.753' }]), { latitude:59.437, longitude:24.753 })
assert.equal(parseNominatimResult([]), null)
assert.equal(parseNominatimResult([{ lat:'nope', lon:'24.7' }]), null)
```

For `resolveCoordinates`, inject a fake store containing a cache hit and a fake `geocode` that throws if called; assert the cache result is returned without network use. Then test cache miss: one geocode call, store save, stable point ID preserved.

- [ ] **Step 2: Run RED**

```bash
cd work-app
node --experimental-strip-types --test src/lib/routing/coordinates.test.ts src/lib/routing/nominatim.test.ts src/lib/routing/geocode.test.ts
```

Expected: FAIL because modules/functions do not exist.

- [ ] **Step 3: Implement pure helpers and Supabase store adapter**

`normalizeAddress` must `trim()`, collapse all whitespace with `/\s+/g`, and lowercase with `toLocaleLowerCase('et-EE')`.

`buildNominatimSearch` must produce `/search?format=jsonv2&limit=1&countrycodes=ee&q=<address>`.

`parseNominatimResult` accepts only a first result whose `lat/lon` parse to finite numbers within valid geographic ranges.

`GeocodeStore` interface:

```ts
export interface GeocodeStore {
  get(normalizedAddress: string): Promise<Coordinates | null>
  save(input: { normalizedAddress:string; address:string; coordinates:Coordinates; siteId?:string|null; stopId?:string|null }): Promise<void>
}
```

The Supabase adapter calls `get_cached_geocode` and `save_geocode_result`; it never selects `geocode_cache` directly.

`resolveCoordinates` resolution order is snapshot -> generic cache -> gateway. On gateway success save before returning. If no coordinate is available, throw `new Error('geocode-failed')`.

- [ ] **Step 4: Run GREEN and full checks**

```bash
cd work-app
npm test
npm run typecheck
npm run build
```

Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add work-app/src/lib/routing/coordinates.ts work-app/src/lib/routing/coordinates.test.ts work-app/src/lib/routing/nominatim.ts work-app/src/lib/routing/nominatim.test.ts work-app/src/lib/routing/geocode-store.ts work-app/src/lib/routing/geocode.ts work-app/src/lib/routing/geocode.test.ts
git commit -m "feat: resolve and cache route coordinates"
```

---

### Task 3: Add globally serialized Cloudflare Nominatim gateway

**Files:**
- Create: `work-app/cloudflare/geocode-throttle/src/index.ts`
- Create: `work-app/cloudflare/geocode-throttle/src/queue.ts`
- Create: `work-app/cloudflare/geocode-throttle/src/queue.test.ts`
- Create: `work-app/cloudflare/geocode-throttle/wrangler.jsonc`
- Create: `work-app/src/lib/routing/cloudflare-geocode.ts`
- Create: `work-app/src/lib/routing/cloudflare-geocode.test.ts`

**Interfaces:**
- Durable Object class name: `GeocodeThrottle`.
- Main app binding name: `GEOCODE_THROTTLE`.
- Stable Durable Object ID: `idFromName('global')`.
- DO request: `POST` JSON `{ "address": "..." }`.
- DO success: `200` JSON `{ "latitude": number, "longitude": number }`.
- No result: `404` JSON `{ "error": "geocode-not-found" }`.
- Upstream/network failure: `502` JSON `{ "error": "geocode-provider-failed" }`.

- [ ] **Step 1: Write RED queue and binding tests**

Extract a pure serial queue that can be tested without Cloudflare runtime:

```ts
const starts:number[] = []
const now = () => clock
const sleep = async (ms:number) => { clock += ms }
const queue = new OnePerSecondQueue({ now, sleep, minGapMs:1000 })
await Promise.all([
  queue.run(async()=>{ starts.push(clock); return 1 }),
  queue.run(async()=>{ starts.push(clock); return 2 }),
  queue.run(async()=>{ starts.push(clock); return 3 }),
])
assert.deepEqual(starts, [0,1000,2000])
```

For `cloudflare-geocode.ts`, fake `getNamespace()` and assert `idFromName('global')`, `stub.fetch()` POST and parsed coordinate output.

- [ ] **Step 2: Run RED**

```bash
cd work-app
node --experimental-strip-types --test cloudflare/geocode-throttle/src/queue.test.ts src/lib/routing/cloudflare-geocode.test.ts
```

Expected: FAIL because queue/gateway modules do not exist.

- [ ] **Step 3: Implement queue and Durable Object**

`OnePerSecondQueue` owns a promise tail and persisted last-start timestamp adapter. The DO stores `lastStartedAt` in Durable Object storage so eviction cannot violate spacing. The critical section must set the next timestamp before performing the upstream fetch.

```ts
const waitMs = Math.max(0, lastStartedAt + 1000 - Date.now())
if (waitMs) await sleep(waitMs)
const startedAt = Date.now()
await this.ctx.storage.put('lastStartedAt', startedAt)
return task()
```

`GeocodeThrottle.fetch()` accepts only POST, validates a non-empty address, builds the Nominatim URL using the shared helper, sends `User-Agent: env.ROUTING_USER_AGENT`, parses the response with `parseNominatimResult`, and never accepts a caller-supplied arbitrary upstream URL.

`wrangler.jsonc` for the throttle worker:

```jsonc
{
  "$schema": "../../node_modules/wrangler/config-schema.json",
  "name": "autokorvtostuk-geocode-throttle",
  "main": "src/index.ts",
  "compatibility_date": "2026-08-23",
  "compatibility_flags": ["nodejs_compat"],
  "vars": { "NOMINATIM_BASE_URL": "https://nominatim.openstreetmap.org" },
  "durable_objects": { "bindings": [{ "name": "GEOCODE_THROTTLE_SELF", "class_name": "GeocodeThrottle" }] },
  "exports": { "GeocodeThrottle": { "type": "durable-object", "storage": "sqlite" } }
}
```

The identifying `ROUTING_USER_AGENT` is configured as a Cloudflare secret/variable at deploy time and is not hard-coded with private contact data in Git.

`cloudflare-geocode.ts` obtains `getCloudflareContext().env.GEOCODE_THROTTLE`, calls the global stub, and returns `null` on 404 while throwing `geocode-provider-failed` on other non-2xx responses.

- [ ] **Step 4: Verify GREEN**

```bash
cd work-app
npm test
npm run typecheck
npm run build
```

Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add work-app/cloudflare/geocode-throttle work-app/src/lib/routing/cloudflare-geocode.ts work-app/src/lib/routing/cloudflare-geocode.test.ts
git commit -m "feat: serialize Nominatim geocoding"
```

---

### Task 4: Add OSRM Table matrix fallback

**Files:**
- Create: `work-app/src/lib/routing/osrm.ts`
- Create: `work-app/src/lib/routing/osrm.test.ts`
- Modify: `work-app/src/lib/routing/types.ts`
- Reuse: `work-app/src/lib/routing/optimizer.ts`

**Interfaces:**

```ts
export async function optimizeRouteOsrm(
  start: ResolvedRoutePoint,
  stops: ResolvedRoutePoint[],
  end: ResolvedRoutePoint,
  baseUrl?: string,
  fetchImpl?: typeof fetch,
): Promise<RouteOptimizationResult>
```

`RouteProposal.source` adds `'osrm-matrix'`.

- [ ] **Step 1: Write RED tests for request mapping, duplicate coordinates, chunking and null routes**

Use stable stop IDs `A1` and `A2` with identical coordinates and assert both survive independently in `orderedStopIds`.

Build 45 points and assert each fake OSRM request contains no more than 40 coordinate entries (20 source + 20 destination chunk) and that all directed matrix cells are filled.

Assert a `null` duration or distance cell rejects with `osrm-unroutable`.

- [ ] **Step 2: Run RED**

```bash
cd work-app
node --experimental-strip-types --test src/lib/routing/osrm.test.ts
```

Expected: FAIL because `osrm.ts` does not exist.

- [ ] **Step 3: Implement chunked table matrix and local optimization**

For each source/destination chunk pair, construct coordinates as `longitude,latitude` and call:

```text
/table/v1/driving/<coords>?sources=<source indexes>&destinations=<destination indexes>&annotations=duration,distance
```

Use chunk size 20. Fill `DurationMatrix` and `DistanceMatrix` keyed by stable point IDs. Reject provider HTTP errors, malformed dimensions and any null required pair.

Calculate current metrics with existing `pathMetrics(start.id, stops.map(s=>s.id), end.id, ...)`, calculate suggested order with `optimizeFixedEndpoints`, then calculate proposed metrics from the same matrices.

Return:

```ts
{
  current,
  proposal: {
    ...proposedMetrics,
    orderedStopIds,
    source: 'osrm-matrix',
  },
}
```

- [ ] **Step 4: Verify GREEN**

```bash
cd work-app
npm test
npm run typecheck
npm run build
```

Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add work-app/src/lib/routing/osrm.ts work-app/src/lib/routing/osrm.test.ts work-app/src/lib/routing/types.ts
git commit -m "feat: add OSRM route optimizer fallback"
```

---

### Task 5: Orchestrate Google -> OSRM without mutating proposals

**Files:**
- Create: `work-app/src/lib/routing/provider.ts`
- Create: `work-app/src/lib/routing/provider.test.ts`
- Modify: `work-app/src/app/route-optimization-actions.ts`
- Modify: `work-app/src/lib/queries.ts` only if route query data needs coordinate columns.
- Modify: `work-app/tests/route-optimization.test.ts`

**Interfaces:**

```ts
export async function optimizeWithFallback(input: {
  start: RoutePoint
  stops: Array<RoutePoint & { siteId?: string|null; stopId?: string|null; coordinates?: Coordinates|null }>
  end: RoutePoint
  googleApiKey?: string
  google: typeof optimizeSmallRouteGoogle | typeof optimizeLargeRouteGoogle
  resolve: (pointInput: ...) => Promise<ResolvedRoutePoint>
  osrm: typeof optimizeRouteOsrm
}): Promise<RouteOptimizationResult>
```

- [ ] **Step 1: Write RED orchestration tests**

Test exact call behavior:

```ts
// Google configured + succeeds: OSRM/resolver never called.
// Google missing: resolve all points then OSRM called once.
// Google throws: resolve all points then OSRM called once.
// Google throws + OSRM throws: action returns routing-failed and no reorder RPC occurs.
```

Keep the existing static acceptance invariant that the proposal section before `applyRouteProposal` does not contain `reorder_job_stops`.

- [ ] **Step 2: Run RED**

```bash
cd work-app
node --experimental-strip-types --test src/lib/routing/provider.test.ts tests/route-optimization.test.ts
```

Expected: FAIL because provider orchestration is missing.

- [ ] **Step 3: Implement provider orchestration and action integration**

Refactor `proposeRouteOptimization` so it still resolves the effective start/pending stop set exactly as today, then calls `optimizeWithFallback`.

Google branch keeps the existing `<=25 => optimizeSmallRouteGoogle`, `>25 => optimizeLargeRouteGoogle` behavior.

OSRM branch resolves coordinates with this metadata:

- saved site stop: `siteId = stop.site_id`, `stopId = stop.id`, snapshot from `latitude_snapshot/longitude_snapshot`;
- manual stop: `stopId = stop.id`, snapshot if already cached;
- route start/end saved site: pass site ID when known;
- manual endpoint/Luige: generic address cache only.

Use `process.env.OSRM_BASE_URL || 'https://router.project-osrm.org'`.

Map geocode failure to stable error `geocode-failed`; provider OSRM failure to existing `routing-failed`. Never change `applyRouteProposal` behavior.

- [ ] **Step 4: Verify GREEN**

```bash
cd work-app
npm test
npm run typecheck
npm run build
```

Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add work-app/src/lib/routing/provider.ts work-app/src/lib/routing/provider.test.ts work-app/src/app/route-optimization-actions.ts work-app/src/lib/queries.ts work-app/tests/route-optimization.test.ts
git commit -m "feat: fall back from Google to OSRM routing"
```

---

### Task 6: Show fallback quality/source and preserve manual operation

**Files:**
- Modify: `work-app/src/components/RouteOptimizationPanel.tsx`
- Modify: `work-app/tests/route-optimization.test.ts`
- Modify: `work-app/tests/acceptance.test.ts`

**Interfaces:**
- Google result label: `Liiklusinfoga`.
- OSRM result label: `Tavapärase sõiduaja järgi`.
- OSRM attribution: `Andmed © OpenStreetMap contributors`.
- `geocode-failed` copy: `Ühte või mitut aadressi ei õnnestunud kaardilt leida. Praegune järjekord jäi muutmata.`

- [ ] **Step 1: Write RED UI tests**

```ts
assert.match(panel, /Liiklusinfoga/)
assert.match(panel, /Tavapärase sõiduaja järgi/)
assert.match(panel, /OpenStreetMap contributors/)
assert.match(panel, /geocode-failed/)
assert.match(panel, /Jäta praegune järjekord/)
assert.match(panel, /Kasuta soovitust/)
```

Also keep existing Waze assertions in manager/operator detail tests.

- [ ] **Step 2: Run RED**

```bash
cd work-app
npm test
```

Expected: FAIL on the new source/attribution copy.

- [ ] **Step 3: Implement minimal UI**

Read `proposal.result.proposal.source` and render one compact line below metrics. Show OSM attribution only for `osrm-matrix`; do not expose provider configuration or API keys.

Add `geocode-failed` to `errorCopy`. No automatic proposal call and no automatic apply is added.

- [ ] **Step 4: Verify GREEN**

```bash
cd work-app
npm test
npm run typecheck
npm run build
```

Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add work-app/src/components/RouteOptimizationPanel.tsx work-app/tests/route-optimization.test.ts work-app/tests/acceptance.test.ts
git commit -m "feat: explain routing fallback quality"
```

---

### Task 7: Configure Next.js/OpenNext Cloudflare deployment

**Files:**
- Modify: `work-app/package.json`
- Modify: `work-app/package-lock.json`
- Create: `work-app/wrangler.jsonc`
- Create: `work-app/open-next.config.ts`
- Create: `work-app/cloudflare-env.d.ts`
- Modify: `work-app/next.config.ts` or `work-app/next.config.mjs` whichever exists on branch.
- Modify: `work-app/.gitignore`
- Modify: `work-app/.env.example`
- Modify: `work-app/README.md`
- Modify: `work-app/tests/acceptance.test.ts`

**Interfaces:**
- Main Worker name: `autokorvtostuk-app`.
- Binding `GEOCODE_THROTTLE` references external script `autokorvtostuk-geocode-throttle`, class `GeocodeThrottle`.
- OpenNext main output `.open-next/worker.js`; assets `.open-next/assets`.

- [ ] **Step 1: Write RED configuration acceptance test**

Assert:

```ts
assert.match(pkg, /@opennextjs\/cloudflare/)
assert.match(pkg, /opennextjs-cloudflare build/)
assert.match(wrangler, /\.open-next\/worker\.js/)
assert.match(wrangler, /nodejs_compat/)
assert.match(wrangler, /GEOCODE_THROTTLE/)
assert.match(wrangler, /autokorvtostuk-geocode-throttle/)
assert.match(openNext, /defineCloudflareConfig/)
assert.doesNotMatch(envExample, /NEXT_PUBLIC_.*ROUT/)
```

- [ ] **Step 2: Run RED**

```bash
cd work-app
npm test
```

Expected: FAIL because Cloudflare configuration files/dependencies are absent.

- [ ] **Step 3: Install current supported adapter/CLI and configure files**

Run:

```bash
cd work-app
npm install @opennextjs/cloudflare@latest
npm install -D wrangler@latest
```

Add scripts:

```json
{
  "preview:cf": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
  "deploy:cf": "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
  "deploy:geocode-throttle": "wrangler deploy -c cloudflare/geocode-throttle/wrangler.jsonc",
  "cf-typegen": "wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts"
}
```

Create main `wrangler.jsonc`:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "autokorvtostuk-app",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-08-23",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },
  "observability": { "enabled": true },
  "durable_objects": {
    "bindings": [{
      "name": "GEOCODE_THROTTLE",
      "class_name": "GeocodeThrottle",
      "script_name": "autokorvtostuk-geocode-throttle"
    }]
  },
  "vars": {
    "OSRM_BASE_URL": "https://router.project-osrm.org"
  }
}
```

Create:

```ts
// open-next.config.ts
import { defineCloudflareConfig } from '@opennextjs/cloudflare'
export default defineCloudflareConfig()
```

Update Next config to call `initOpenNextCloudflareForDev()` without changing existing Next config options.

Add `.open-next`, `.wrangler`, `.dev.vars*` to `.gitignore`.

Add env documentation for `GOOGLE_MAPS_ROUTES_API_KEY`, `OSRM_BASE_URL`, `NOMINATIM_BASE_URL`, `ROUTING_USER_AGENT`; keep secrets server-only.

Run `npm run cf-typegen` and commit the generated binding declaration only if it contains no secrets.

- [ ] **Step 4: Verify Node and Workers builds**

Run:

```bash
cd work-app
npm test
npm run typecheck
npm run build
npx opennextjs-cloudflare build
```

Expected: all exit 0 and `.open-next/worker.js` is generated.

- [ ] **Step 5: Commit**

```bash
git add work-app/package.json work-app/package-lock.json work-app/wrangler.jsonc work-app/open-next.config.ts work-app/cloudflare-env.d.ts work-app/next.config.* work-app/.gitignore work-app/.env.example work-app/README.md work-app/tests/acceptance.test.ts
git commit -m "feat: add Cloudflare Workers deployment"
```

---

### Task 8: Apply routing schema and bootstrap known coordinates safely

**Files:**
- Modify: `work-app/README.md` with operational command/result notes only after execution.

**Interfaces:**
- Production Supabase receives only migration `20260823164000_routing_coordinates_cache.sql` in this release.
- Bootstrap set: Luige base address + exactly the 59 active saved Neste sites already imported.
- Bootstrap is serialized through `GeocodeThrottle`; no direct parallel Nominatim calls.

- [ ] **Step 1: Fresh pre-production verification**

```bash
cd work-app
npm test
npm run typecheck
npm run build
npx opennextjs-cloudflare build
```

Expected: all exit 0 on the exact deployment commit.

- [ ] **Step 2: Apply migration and verify schema**

Apply `20260823164000_routing_coordinates_cache.sql` through the connected Supabase project. Query `information_schema.columns` and `pg_proc` to verify all columns/RPCs exist before proceeding.

- [ ] **Step 3: Deploy throttle Worker before any bootstrap**

Configure `ROUTING_USER_AGENT` with an application identifier/contact route in Cloudflare, then deploy `autokorvtostuk-geocode-throttle`. Verify one known Luige geocode request through the Durable Object returns finite coordinates.

- [ ] **Step 4: Bootstrap Luige + 59 Neste sites serially**

Use the same `resolveCoordinates`/throttle path as runtime. Process one address at a time; do not bypass the Durable Object and do not spawn parallel geocodes. After completion assert:

```sql
select count(*) from public.customer_sites
where customer_id = '<Neste customer id>'
  and active = true
  and latitude is not null
  and longitude is not null;
```

Expected: `59`.

Verify the Luige normalized key exists once in `geocode_cache`.

- [ ] **Step 5: Roll back only test rows on failure**

If bootstrap fails for individual stations, keep successful cached coordinates, record exact unresolved station names/addresses, and do not fabricate values. Runtime manual order + Waze stays usable for unresolved addresses.

- [ ] **Step 6: Record verified bootstrap state**

Update README operational notes with the migration name, bootstrap count and unresolved count (expected zero only if actually observed).

- [ ] **Step 7: Commit documentation only**

```bash
git add work-app/README.md
git commit -m "docs: record routing cache bootstrap"
```

---

### Task 9: Deploy Cloudflare preview and run complete smoke test

**Files:**
- Modify: `work-app/README.md` only for verified deployment facts.

**Interfaces:**
- Preview hostname: Cloudflare-assigned `*.workers.dev` for `autokorvtostuk-app`.
- Production custom domain remains unchanged throughout this task.

- [ ] **Step 1: Configure preview/build environment**

Set Cloudflare variables/secrets required by the app:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `ROUTING_USER_AGENT`
- optional `GOOGLE_MAPS_ROUTES_API_KEY` (leave absent for the required OSRM fallback smoke)
- `OSRM_BASE_URL=https://router.project-osrm.org`
- `NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org`

- [ ] **Step 2: Deploy throttle and main preview**

Deploy throttle first, then main app to `workers.dev`. Do not attach `app.autokorvtostuk.ee` yet.

- [ ] **Step 3: Smoke login/auth/runtime**

Verify manager login, worker login/view switch, Supabase reads and one reversible write from the Workers runtime.

- [ ] **Step 4: Smoke five-stop Neste route with Google key absent**

Create a clearly marked test job using five real saved Neste sites. Verify:

1. no optimization occurs before button press;
2. `Optimeeri marsruut` returns current vs suggested time/km;
3. source copy is `Tavapärase sõiduaja järgi` + OSM attribution;
4. `Jäta praegune järjekord` leaves persisted sequence unchanged;
5. `Kasuta soovitust` changes only pending sequence;
6. manual drag can change it again;
7. Waze opens the selected next address.

- [ ] **Step 5: Smoke active remaining-route flow**

Start the test job as assigned operator, complete one stop with note + photo, skip one with note, add a new stop, run `Optimeeri ülejäänud marsruut`, and verify terminal/current rows remain fixed while only pending stops reorder.

Verify manager terminal correction/audit still works.

- [ ] **Step 6: Smoke failure degradation**

Exercise a preview configuration with an invalid OSRM base URL or injected provider failure. Assert error copy appears, persisted route sequence is unchanged, manual drag still works and Waze still opens.

- [ ] **Step 7: Remove smoke-test data**

Delete/roll back only rows created for the marked smoke test and verify no test job remains.

- [ ] **Step 8: Record preview evidence**

Update README with the actual Workers preview hostname and smoke date/results only after all checks above pass.

- [ ] **Step 9: Commit verified documentation**

```bash
git add work-app/README.md
git commit -m "docs: record Cloudflare preview smoke"
```

---

### Task 10: Cut over `app.autokorvtostuk.ee` with rollback gate

**Files:**
- Modify: `work-app/README.md` only after verified cutover.

**Interfaces:**
- Custom domain: `app.autokorvtostuk.ee`.
- Previous known-good target must be recorded before DNS/route change.

- [ ] **Step 1: Capture current custom-domain target and rollback value**

Read the current DNS/hosting target for `app.autokorvtostuk.ee` and record the exact previous value privately in the execution notes before mutation.

- [ ] **Step 2: Bind the verified Worker to the custom domain**

Use Cloudflare custom-domain/route configuration for the already smoke-tested `autokorvtostuk-app` deployment. Do not change public `autokorvtostuk.ee`.

- [ ] **Step 3: Verify TLS and application behavior on custom domain**

Verify HTTPS, login, manager page, worker page, one read-only real job view and one reversible test mutation. Verify the route optimization button still falls back to OSRM without a Google key.

- [ ] **Step 4: Roll back immediately on custom-domain failure**

If TLS/auth/runtime/custom-domain checks fail, restore the exact target captured in Step 1. Do not roll back Supabase schema merely because hosting failed.

- [ ] **Step 5: Fresh post-cutover CI verification**

On the exact branch head:

```bash
cd work-app
npm test
npm run typecheck
npm run build
npx opennextjs-cloudflare build
```

Expected: all exit 0.

- [ ] **Step 6: Record production deployment facts**

Update README with Cloudflare as primary work-app deployment, the live custom domain, fallback routing behavior, and rollback note. Do not claim Google traffic-aware routing is active unless a valid key is actually configured and verified.

- [ ] **Step 7: Commit documentation**

```bash
git add work-app/README.md
git commit -m "docs: record Cloudflare production cutover"
```

---

## Final Verification Checklist

Before declaring this release complete, verify all of the following with fresh evidence:

- [ ] `npm test` passes with zero failures.
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run build` exits 0.
- [ ] `npx opennextjs-cloudflare build` exits 0.
- [ ] Production Supabase has routing coordinate/cache migration and secure RPCs.
- [ ] Exactly 59 active Neste sites have valid coordinates if bootstrap reported full success; otherwise unresolved sites are explicitly listed and no coordinates are fabricated.
- [ ] Google key absent still produces a five-stop OSRM proposal in Workers preview/live.
- [ ] Proposal calculation never changes route order without `Kasuta soovitust`.
- [ ] Provider/geocoder failure leaves manual ordering + Waze usable.
- [ ] Nominatim cache misses are globally serialized through `GeocodeThrottle` and OSM attribution is shown for fallback results.
- [ ] `app.autokorvtostuk.ee` serves the verified Cloudflare Worker with valid TLS.
- [ ] Vercel status is irrelevant to the active production release path.
- [ ] `main` remains untouched unless the user separately approves integration.
