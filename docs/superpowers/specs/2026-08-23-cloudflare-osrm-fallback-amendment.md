# Cloudflare + OSRM Fallback Design Amendment: Global Nominatim Throttle

**Date:** 2026-08-23

**Amends:** `docs/superpowers/specs/2026-08-23-cloudflare-osrm-fallback-design.md`

## Why this amendment is required

Cloudflare Workers are stateless and requests can execute in different isolates/locations. A normal in-process timer or module-level timestamp therefore cannot guarantee Nominatim's public-service rule of an absolute maximum of one request per second across the whole application.

The public Nominatim endpoint must remain a low-volume fallback only. Cache hits must bypass it completely, and every cache miss must pass through one globally coordinated serial request stream.

## Architecture change

Add a single Cloudflare Durable Object class named `GeocodeThrottle`.

All Nominatim requests from the deployed Workers application flow through the same deterministic Durable Object instance, obtained by a stable name such as `nominatim-global`.

The flow becomes:

`route optimization -> coordinate resolver -> Supabase cache/site/stop snapshot -> cache miss -> GeocodeThrottle Durable Object -> Nominatim -> persist cache -> OSRM`

Google routing still bypasses geocoding entirely when Google succeeds. Manual ordering and Waze remain available if the fallback stack fails.

## Durable Object responsibilities

`GeocodeThrottle` has one responsibility: serialize outgoing public Nominatim requests and guarantee at least 1000 ms between request start times.

It stores the latest dispatch timestamp in Durable Object storage so hibernation/restart does not reset the throttle window. For each request it:

1. validates that the request is an internal geocoding request with a non-empty address;
2. reads the persisted last-dispatch timestamp;
3. waits until at least 1000 ms have elapsed since the previous dispatch;
4. persists the new dispatch timestamp before starting the provider call;
5. calls the configured Nominatim base URL with the required identifying User-Agent/Referer and Estonia-scoped query;
6. returns only the normalized geocoding result or a stable provider error to the caller.

It does not own the long-term address cache. Supabase `geocode_cache`, customer-site coordinates and job-stop coordinate snapshots remain the persistent routing cache described in the main spec.

## Cloudflare configuration

`wrangler.jsonc` must include a Durable Object binding such as:

```jsonc
{
  "durable_objects": {
    "bindings": [
      {
        "name": "GEOCODE_THROTTLE",
        "class_name": "GeocodeThrottle"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["GeocodeThrottle"]
    }
  ]
}
```

The OpenNext Worker entry/configuration must export the Durable Object class in the manner required by the current `@opennextjs/cloudflare` integration. Exact generated-entry wiring is an implementation detail, but the final build must expose the binding in Workers preview and production.

## Local and non-Cloudflare behavior

Unit tests and local Node tests must not require a live Durable Object. The coordinate resolver accepts an injected geocoding transport interface.

Production Cloudflare runtime uses the Durable Object transport. Tests use a fake transport. If a non-Cloudflare runtime is retained for Vercel/local preview, it may use a process-local serialized transport only for development/testing; that transport is not considered compliant for production use of the public Nominatim endpoint.

Therefore Cloudflare is the supported production host for the public-Nominatim fallback path.

## Failure behavior

If the Durable Object binding is missing, overloaded, or returns an error:

- no direct unthrottled Nominatim request is attempted as a hidden fallback;
- route optimization returns a non-destructive address/routing error;
- persisted route order remains unchanged;
- manual stop ordering and Waze remain usable.

## Tests added to the main design

Implementation must cover:

- two concurrent geocode cache misses are dispatched at least 1000 ms apart by the throttle;
- persisted `lastDispatchAt` survives a new Durable Object instance lifecycle in the test harness;
- cache hits never invoke `GeocodeThrottle`;
- missing Durable Object binding never falls through to direct Nominatim;
- provider failure does not write geocode cache coordinates;
- Cloudflare configuration contains exactly one global geocode throttle binding/class migration;
- routing acceptance tests remain proposal-only and non-destructive on geocoding failure.

## Success criterion amendment

The Cloudflare/OSRM fallback release is not considered production-ready until public Nominatim calls are globally serialized through `GeocodeThrottle` (or an equivalently strict centralized mechanism). An in-memory Worker limiter alone is insufficient.

## References checked 2026-08-23

- Cloudflare Durable Objects rules/best practices: https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- Cloudflare Durable Objects limits: https://developers.cloudflare.com/durable-objects/platform/limits/
- Nominatim public usage policy: https://operations.osmfoundation.org/policies/nominatim/
