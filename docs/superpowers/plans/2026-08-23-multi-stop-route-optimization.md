# Multi-Stop Route Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit fastest-route optimization for all stops or only remaining stops, while preserving manual ordering and using Waze for actual navigation.

**Architecture:** Put Google routing behind a server-only adapter. For up to 25 movable stops, call Google Routes API twice: once to estimate the current saved order and once with `optimizeWaypointOrder=true` to obtain the proposed fastest order. For larger jobs, build a batched duration/distance matrix and run a deterministic fixed-start/fixed-end nearest-neighbor + 2-opt heuristic locally. Optimization only returns a proposal; saved order changes only after the user presses `Kasuta soovitust`.

**Tech Stack:** Next.js 16.3.2, React 19.2.8, TypeScript 7.0.2, Supabase/PostgreSQL 17, Google Maps Platform Routes API, native `fetch`, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-23-multi-stop-job-routing-design.md`

**Prerequisite Plan:** `docs/superpowers/plans/2026-08-23-multi-stop-job-foundation.md`

## Global Constraints

- Work only on branch `app-v1-build`; do not modify `main`.
- Optimization never runs automatically.
- Primary objective is fastest driving order; use `TRAFFIC_AWARE`, not distance-first routing.
- Proposal must not mutate the persisted order until user confirmation.
- After applying a proposal, manager/operator may still reorder manually.
- `Optimeeri ülejäänud marsruut` may move only `pending` stops; `done`, `skipped`, and `in_progress` are fixed.
- Waze remains navigation; Google is only the server-side route estimate/optimization provider.
- No application-level stop-count limit.
- Provider failure or quota failure must leave the current saved order unchanged.
- API key must remain server-only and must never use a `NEXT_PUBLIC_` prefix.
- Every implementation task follows TDD: test first, observe RED, implement minimally, observe GREEN, then commit.

---

## File Structure

### Routing domain
- Create `work-app/src/lib/routing/types.ts` — provider-independent point, metrics, proposal and result types.
- Create `work-app/src/lib/routing/optimizer.ts` — deterministic local matrix optimizer and route-metric helpers.
- Create `work-app/src/lib/routing/optimizer.test.ts` — pure algorithm tests.
- Create `work-app/src/lib/routing/google-routes.ts` — server-only Google Routes client, current-route estimate, direct optimization, batched matrix retrieval and throttling.
- Create `work-app/src/lib/routing/google-routes.test.ts` — request/response mapping tests with injected fetch/sleep.

### Actions/API
- Create `work-app/src/app/route-optimization-actions.ts` — load job/stops, determine movable subset and effective endpoints, request comparison, apply accepted proposal through existing guarded reorder RPC.
- Modify `work-app/src/lib/queries.ts` — base-location and route data helpers as needed.

### UI
- Create `work-app/src/components/RouteOptimizationPanel.tsx` — explicit optimize button, current-vs-proposed comparison, accept/cancel.
- Modify `work-app/src/components/JobStopsEditor.tsx` — planning optimization panel.
- Modify `work-app/src/app/operator/jobs/[id]/page.tsx` — remaining-route optimize button during active work.
- Modify `work-app/src/app/manager/jobs/[id]/page.tsx` — planning/remaining optimization access.
- Modify `work-app/tests/acceptance.test.ts` — explicit-button/no-auto-apply checks.

### Configuration
- Modify `work-app/.env.example` — `GOOGLE_MAPS_ROUTES_API_KEY=`.
- Modify `work-app/README.md` — production Vercel environment setup and behavior when key is missing.

---

### Task 1: Define provider-independent routing types and deterministic local optimizer

**Files:**
- Create: `work-app/src/lib/routing/types.ts`
- Create: `work-app/src/lib/routing/optimizer.ts`
- Create: `work-app/src/lib/routing/optimizer.test.ts`

**Interfaces:**

```ts
export type RoutePoint = { id: string; address: string }
export type RouteMetrics = { durationSeconds: number; distanceMeters: number | null }
export type RouteProposal = RouteMetrics & {
  orderedStopIds: string[]
  source: 'google-waypoint' | 'matrix-heuristic'
}
export type RouteOptimizationResult = { current: RouteMetrics; proposal: RouteProposal }
export type DurationMatrix = Record<string, Record<string, number>>
export type DistanceMatrix = Record<string, Record<string, number>>
export function optimizeFixedEndpoints(startId: string, stopIds: string[], endId: string, matrix: DurationMatrix): string[]
export function pathMetrics(startId: string, stopIds: string[], endId: string, duration: DurationMatrix, distance: DistanceMatrix): RouteMetrics
```

- [ ] **Step 1: Write failing optimizer tests**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { optimizeFixedEndpoints, pathMetrics } from './optimizer.ts'

test('optimizer keeps fixed endpoints and finds a faster stop order', () => {
  const matrix = {
    S:{A:10,B:2,E:99},
    A:{B:10,E:2,S:10},
    B:{A:2,E:10,S:2},
    E:{S:99,A:2,B:10},
  }
  assert.deepEqual(optimizeFixedEndpoints('S',['A','B'],'E',matrix), ['B','A'])
})

test('optimizer preserves duplicate stop occurrences by unique stop ids', () => {
  const matrix = {
    S:{A1:1,A2:2,E:9}, A1:{A2:1,E:2,S:1}, A2:{A1:1,E:1,S:2}, E:{A1:2,A2:1,S:9},
  }
  const order = optimizeFixedEndpoints('S',['A1','A2'],'E',matrix)
  assert.equal(order.length, 2)
  assert.deepEqual(new Set(order), new Set(['A1','A2']))
})

test('path metrics include start, every stop, and fixed end', () => {
  const duration = { S:{A:3}, A:{B:4}, B:{E:5} }
  const distance = { S:{A:300}, A:{B:400}, B:{E:500} }
  assert.deepEqual(pathMetrics('S',['A','B'],'E',duration,distance), { durationSeconds:12, distanceMeters:1200 })
})
```

- [ ] **Step 2: Run and verify RED**

```bash
cd work-app
node --experimental-strip-types --test src/lib/routing/optimizer.test.ts
```

Expected: FAIL because routing modules do not exist.

- [ ] **Step 3: Implement nearest-neighbor seed**

Use current node -> cheapest unvisited duration, stable tie-break by original stop order. End point is never inserted as an intermediate stop.

```ts
function nearestNeighbor(startId: string, stopIds: string[], matrix: DurationMatrix) {
  const remaining = [...stopIds]
  const ordered: string[] = []
  let current = startId
  while (remaining.length) {
    let bestIndex = 0
    for (let i = 1; i < remaining.length; i++) {
      if (matrix[current][remaining[i]] < matrix[current][remaining[bestIndex]]) bestIndex = i
    }
    const [next] = remaining.splice(bestIndex, 1)
    ordered.push(next)
    current = next
  }
  return ordered
}
```

- [ ] **Step 4: Add fixed-endpoint 2-opt improvement and path metrics**

Compute path cost as `start -> stops -> end`; repeatedly reverse stop slices only when total duration strictly decreases. Stop when a full pass yields no improvement. `pathMetrics` sums the exact directed duration/distance legs for a supplied order.

- [ ] **Step 5: Run tests and verify GREEN**

```bash
cd work-app
node --experimental-strip-types --test src/lib/routing/optimizer.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add work-app/src/lib/routing/types.ts work-app/src/lib/routing/optimizer.ts work-app/src/lib/routing/optimizer.test.ts
git commit -m "feat: add route optimization domain"
```

---

### Task 2: Add current-route estimate and direct Google waypoint optimization for 25 or fewer stops

**Files:**
- Create: `work-app/src/lib/routing/google-routes.ts`
- Create: `work-app/src/lib/routing/google-routes.test.ts`
- Modify: `work-app/.env.example`

**Interfaces:**

```ts
export type FetchLike = typeof fetch
export async function estimateOrderedRouteGoogle(
  start: RoutePoint,
  stops: RoutePoint[],
  end: RoutePoint,
  apiKey: string,
  fetchImpl?: FetchLike,
): Promise<RouteMetrics>

export async function optimizeWaypointsGoogle(
  start: RoutePoint,
  stops: RoutePoint[],
  end: RoutePoint,
  apiKey: string,
  fetchImpl?: FetchLike,
): Promise<RouteProposal>

export async function optimizeSmallRouteGoogle(
  start: RoutePoint,
  stops: RoutePoint[],
  end: RoutePoint,
  apiKey: string,
  fetchImpl?: FetchLike,
): Promise<RouteOptimizationResult>
```

- [ ] **Step 1: Write failing request-mapping test**

Inject a fake fetch and assert both current and optimized requests. The optimized request must set `optimizeWaypointOrder:true`; both use traffic-aware driving and Estonia region:

```ts
test('Google small-route optimizer compares current and proposed order', async () => {
  const bodies: any[] = []
  const fakeFetch: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)); bodies.push(body)
    const optimized = body.optimizeWaypointOrder === true
    return new Response(JSON.stringify({ routes:[{
      optimizedIntermediateWaypointIndex: optimized ? [1,0] : undefined,
      duration: optimized ? '90s' : '120s', distanceMeters: optimized ? 1000 : 1200,
    }] }), { status:200 })
  }
  const result = await optimizeSmallRouteGoogle(
    {id:'S',address:'Luige, Estonia'},
    [{id:'A',address:'A'},{id:'B',address:'B'}],
    {id:'E',address:'Luige, Estonia'},
    'secret', fakeFetch,
  )
  assert.equal(bodies.length, 2)
  assert.equal(bodies[0].optimizeWaypointOrder, false)
  assert.equal(bodies[1].optimizeWaypointOrder, true)
  assert.equal(bodies[1].routingPreference, 'TRAFFIC_AWARE')
  assert.deepEqual(result.proposal.orderedStopIds, ['B','A'])
  assert.equal(result.current.durationSeconds, 120)
})
```

- [ ] **Step 2: Run and verify RED**

```bash
cd work-app
node --experimental-strip-types --test src/lib/routing/google-routes.test.ts
```

- [ ] **Step 3: Implement shared `computeRoutes` request**

POST to `https://routes.googleapis.com/directions/v2:computeRoutes` with:

```ts
const body = {
  origin: { address: start.address },
  destination: { address: end.address },
  intermediates: stops.map((s) => ({ address: s.address })),
  travelMode: 'DRIVE',
  routingPreference: 'TRAFFIC_AWARE',
  regionCode: 'ee',
  optimizeWaypointOrder,
}
const fieldMask = optimizeWaypointOrder
  ? 'routes.optimizedIntermediateWaypointIndex,routes.duration,routes.distanceMeters'
  : 'routes.duration,routes.distanceMeters'
```

Use `X-Goog-Api-Key` and `X-Goog-FieldMask`; never return the key to client code. Reject direct calls with `stops.length > 25` so the caller chooses the matrix path.

- [ ] **Step 4: Implement current/proposed comparison**

`optimizeSmallRouteGoogle` calls `estimateOrderedRouteGoogle` first and `optimizeWaypointsGoogle` second, returning `{ current, proposal }`. Parse Google durations such as `"120s"` into integer seconds.

- [ ] **Step 5: Add configuration placeholder**

Append to `.env.example`:

```dotenv
GOOGLE_MAPS_ROUTES_API_KEY=
```

- [ ] **Step 6: Run tests/typecheck and verify GREEN**

```bash
cd work-app
npm test
npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add work-app/src/lib/routing/google-routes.ts work-app/src/lib/routing/google-routes.test.ts work-app/.env.example
git commit -m "feat: add Google waypoint optimizer"
```

---

### Task 3: Support more than 25 stops with a batched route matrix

**Files:**
- Modify: `work-app/src/lib/routing/google-routes.ts`
- Modify: `work-app/src/lib/routing/google-routes.test.ts`
- Modify: `work-app/src/lib/routing/optimizer.ts`
- Modify: `work-app/src/lib/routing/optimizer.test.ts`

**Interfaces:**

```ts
export type Sleep = (ms: number) => Promise<void>
export async function buildGoogleRouteMatrix(
  points: RoutePoint[],
  apiKey: string,
  fetchImpl?: FetchLike,
  sleepImpl?: Sleep,
): Promise<{ duration: DurationMatrix; distance: DistanceMatrix }>

export async function optimizeLargeRouteGoogle(
  start: RoutePoint,
  stops: RoutePoint[],
  end: RoutePoint,
  apiKey: string,
  fetchImpl?: FetchLike,
  sleepImpl?: Sleep,
): Promise<RouteOptimizationResult>
```

- [ ] **Step 1: Write failing batching test**

Create 31 points and fake the route-matrix endpoint. Assert every request has at most 25 origins, at most 25 destinations and at most 625 origin×destination elements; assert the final matrix contains every directed pair needed by the optimizer.

```ts
assert.ok(requests.every((r) => r.origins.length <= 25))
assert.ok(requests.every((r) => r.destinations.length <= 25))
assert.ok(requests.every((r) => r.origins.length * r.destinations.length <= 625))
```

- [ ] **Step 2: Run and verify RED**

```bash
cd work-app
node --experimental-strip-types --test src/lib/routing/google-routes.test.ts
```

- [ ] **Step 3: Implement 25×25 chunking with the exact Google matrix shape**

Build chunks with:

```ts
const chunk = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i*size, (i+1)*size))
```

For each chunk pair POST to `https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix`:

```ts
const body = {
  origins: originChunk.map((p) => ({ waypoint: { address: p.address } })),
  destinations: destinationChunk.map((p) => ({ waypoint: { address: p.address } })),
  travelMode: 'DRIVE',
  routingPreference: 'TRAFFIC_AWARE',
  regionCode: 'ee',
}
const fieldMask = 'originIndex,destinationIndex,duration,distanceMeters,status,condition'
```

Map each returned element back to stable point IDs using the chunk-local `originIndex`/`destinationIndex`. Treat any element whose `condition !== 'ROUTE_EXISTS'` as a provider failure for the whole proposal; do not invent a zero/large distance.

- [ ] **Step 4: Throttle matrix requests by element budget**

Track elements submitted inside a rolling one-minute window. Before a request would push the local budget over 2900 elements, await enough time to enter the next window. Inject sleep in tests so tests do not actually wait:

```ts
const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
```

- [ ] **Step 5: Build current and proposed metrics from the same matrix**

Use `pathMetrics(start.id, stops.map(s => s.id), end.id, ...)` for `current`. Use `optimizeFixedEndpoints` to obtain the proposed order, then call `pathMetrics` again. Return:

```ts
return {
  current,
  proposal: { ...optimizedMetrics, orderedStopIds, source: 'matrix-heuristic' },
}
```

- [ ] **Step 6: Run tests/typecheck and verify GREEN**

```bash
cd work-app
npm test
npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add work-app/src/lib/routing/google-routes.ts work-app/src/lib/routing/google-routes.test.ts work-app/src/lib/routing/optimizer.ts work-app/src/lib/routing/optimizer.test.ts
git commit -m "feat: optimize large multi-stop routes"
```

---

### Task 4: Build explicit route proposal server actions with no auto-apply

**Files:**
- Create: `work-app/src/app/route-optimization-actions.ts`
- Modify: `work-app/src/lib/queries.ts`
- Modify: `work-app/tests/acceptance.test.ts`

**Interfaces:**

```ts
export async function proposeRouteOptimization(input: {
  jobId: string
  mode: 'all' | 'remaining'
}): Promise<{ ok: true; result: RouteOptimizationResult; stopNames: Record<string,string> } | { ok:false; error:string }>

export async function applyRouteProposal(formData: FormData): Promise<void>
```

- [ ] **Step 1: Write failing acceptance test**

```ts
test('route optimization is proposal-only until user applies it', () => {
  const actions = readFileSync(resolve(root, 'src/app/route-optimization-actions.ts'), 'utf8')
  assert.match(actions, /proposeRouteOptimization/)
  assert.match(actions, /applyRouteProposal/)
  assert.match(actions, /reorder_job_stops/)
  assert.doesNotMatch(actions, /proposeRouteOptimization[\s\S]*reorder_job_stops[\s\S]*return/)
})
```

- [ ] **Step 2: Run and verify RED**

```bash
cd work-app
npm test
```

- [ ] **Step 3: Implement job/endpoint resolution**

Resolve base address in this order:

```ts
const startAddress = job.route_start_address || baseLocation.address
const endAddress = job.route_end_address || baseLocation.address
```

For `all`, movable stops are every `pending` stop only when no stop has `actual_start`; otherwise return `use-remaining`. For `remaining`, choose effective start as the active `in_progress` stop address, else the highest-sequence terminal stop that has actually been reached, else route start. Movable set is only `pending` stops.

Reject optimization when start/end address is blank or fewer than two pending stops remain; return stable errors `route-endpoint-missing` or `nothing-to-optimize`.

- [ ] **Step 4: Choose routing path by stop count**

```ts
const result = movable.length <= 25
  ? await optimizeSmallRouteGoogle(start, movable, end, apiKey)
  : await optimizeLargeRouteGoogle(start, movable, end, apiKey)
```

If `GOOGLE_MAPS_ROUTES_API_KEY` is missing, return `{ok:false,error:'routing-not-configured'}`. Catch provider failures and return `{ok:false,error:'routing-failed'}`; never call reorder on failure.

- [ ] **Step 5: Implement accepted proposal application**

`applyRouteProposal` receives ordered stop IDs plus `expectedRevision`; validate all IDs are still pending stops in that job and then call the existing guarded `reorder_job_stops` RPC. A stale revision returns `stale-route`. The action never recomputes/replaces an already shown proposal silently.

- [ ] **Step 6: Run tests/typecheck/build and verify GREEN**

```bash
cd work-app
npm test
npm run typecheck
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add work-app/src/app/route-optimization-actions.ts work-app/src/lib/queries.ts work-app/tests/acceptance.test.ts
git commit -m "feat: add explicit route optimization actions"
```

---

### Task 5: Add planning and remaining-route optimization UI

**Files:**
- Create: `work-app/src/components/RouteOptimizationPanel.tsx`
- Modify: `work-app/src/components/JobStopsEditor.tsx`
- Modify: `work-app/src/app/operator/jobs/[id]/page.tsx`
- Modify: `work-app/src/app/manager/jobs/[id]/page.tsx`
- Modify: `work-app/tests/acceptance.test.ts`

**Interfaces:**
- `RouteOptimizationPanel({ jobId, mode, routeRevision })` invokes proposal action only on button press.
- Planning button copy: `Optimeeri marsruut`.
- Active-work button copy: `Optimeeri ülejäänud marsruut`.
- Proposal offers `Kasuta soovitust` and `Jäta praegune järjekord`.

- [ ] **Step 1: Write failing acceptance test**

```ts
test('optimization UI is explicit and preserves manual control', () => {
  const panel = readFileSync(resolve(root, 'src/components/RouteOptimizationPanel.tsx'), 'utf8')
  assert.match(panel, /Optimeeri marsruut/)
  assert.match(panel, /Optimeeri ülejäänud marsruut/)
  assert.match(panel, /Kasuta soovitust/)
  assert.match(panel, /Jäta praegune järjekord/)
  assert.doesNotMatch(panel, /useEffect\([^)]*proposeRouteOptimization/)
})
```

- [ ] **Step 2: Run and verify RED**

```bash
cd work-app
npm test
```

- [ ] **Step 3: Implement proposal panel**

On explicit click, display current vs proposed route metrics:

```tsx
<p>Praegune: {formatKm(result.current.distanceMeters)} · {formatDuration(result.current.durationSeconds)}</p>
<p>Soovitus: {formatKm(result.proposal.distanceMeters)} · {formatDuration(result.proposal.durationSeconds)}</p>
<p>{formatDelta(result.current.durationSeconds, result.proposal.durationSeconds)}</p>
```

Also render the proposed stop-name sequence before confirmation.

- [ ] **Step 4: Integrate planning mode**

`JobStopsEditor` renders `mode="all"` when no stop has started. After applying, reload the saved server order; keep drag reorder enabled.

- [ ] **Step 5: Integrate active-work mode**

Manager/operator job details render `mode="remaining"` whenever at least two pending stops remain and the job has progressed. Applying the proposal only changes pending stop order; done/skipped/in-progress rows remain fixed.

- [ ] **Step 6: Add provider/error copy**

Use stable messages:
- `routing-not-configured` → `Marsruudi optimeerimine pole veel seadistatud.`
- `route-endpoint-missing` → `Marsruudi algus- või lõpp-punkt vajab aadressi.`
- `nothing-to-optimize` → `Optimeerimiseks on vaja vähemalt kahte tegemata peatust.`
- `routing-failed` → `Marsruuti ei õnnestunud arvutada. Praegune järjekord jäi muutmata.`
- `stale-route` → `Marsruuti muudeti teises vaates. Värskenda ja proovi uuesti.`

- [ ] **Step 7: Run tests/typecheck/build and verify GREEN**

```bash
cd work-app
npm test
npm run typecheck
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add work-app/src/components/RouteOptimizationPanel.tsx work-app/src/components/JobStopsEditor.tsx work-app/src/app/operator/jobs/[id]/page.tsx work-app/src/app/manager/jobs/[id]/page.tsx work-app/tests/acceptance.test.ts
git commit -m "feat: add explicit route optimization UI"
```

---

### Task 6: Production configuration and route optimization smoke test

**Files:**
- Modify: `work-app/README.md`

**Interfaces:**
- Vercel server environment includes `GOOGLE_MAPS_ROUTES_API_KEY`.
- Missing key degrades only optimization; manual ordering and Waze remain usable.

- [ ] **Step 1: Document exact environment setup**

Add to README:

```text
GOOGLE_MAPS_ROUTES_API_KEY — server-only Google Maps Platform Routes API key. Configure in Vercel Production/Preview; never prefix with NEXT_PUBLIC_. If absent, route optimization is disabled but manual stop ordering and Waze navigation continue to work.
```

- [ ] **Step 2: Run fresh verification before deployment**

```bash
cd work-app
npm test
npm run typecheck
npm run build
```

Expected: all exit 0.

- [ ] **Step 3: Configure production key and verify Vercel**

Set `GOOGLE_MAPS_ROUTES_API_KEY` in Vercel project environment and trigger/verify a successful deployment from `app-v1-build`.

- [ ] **Step 4: Smoke test a five-stop Neste route**

Use five real saved Neste station records. Verify `Optimeeri marsruut` does nothing before click, returns both current and proposed time/km after click, `Jäta praegune järjekord` leaves DB order unchanged, `Kasuta soovitust` changes only pending order, and manual drag can change it again.

- [ ] **Step 5: Smoke test active remaining-route behavior**

Complete one stop, skip one with note, add a new stop, press `Optimeeri ülejäänud marsruut`, confirm done/skipped/current rows do not move, accept the proposal, and verify Waze opens the new next pending address.

- [ ] **Step 6: Smoke test provider failure**

Temporarily exercise the missing/invalid-key path in a preview environment. Verify error copy appears and the persisted stop order is byte-for-byte unchanged.

- [ ] **Step 7: Commit documentation**

```bash
git add work-app/README.md
git commit -m "docs: document route optimization configuration"
```
