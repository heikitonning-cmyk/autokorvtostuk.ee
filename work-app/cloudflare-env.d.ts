interface CloudflareEnv {
  ASSETS: {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
  }
  GEOCODE_THROTTLE: import('./src/lib/routing/cloudflare-geocode').DurableObjectNamespaceLike
  OSRM_BASE_URL: string
  NEXT_PUBLIC_SUPABASE_URL: string
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string
  GOOGLE_MAPS_ROUTES_API_KEY?: string
  NOMINATIM_BASE_URL?: string
  ROUTING_USER_AGENT?: string
}
