export type Coordinates = {
  latitude: number
  longitude: number
}

function isCoordinates(value: unknown): value is Coordinates {
  if (!value || typeof value !== 'object') return false
  const latitude = Number((value as Coordinates).latitude)
  const longitude = Number((value as Coordinates).longitude)
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180
}

export function buildNominatimSearch(address: string, baseUrl: string) {
  const url = new URL('/search', baseUrl)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '1')
  url.searchParams.set('countrycodes', 'ee')
  url.searchParams.set('q', address)
  return url
}

export function parseNominatimResult(payload: unknown): Coordinates | null {
  if (!Array.isArray(payload) || payload.length === 0) return null
  const first = payload[0]
  if (!first || typeof first !== 'object') return null
  const coordinates = {
    latitude: Number((first as { lat?: unknown }).lat),
    longitude: Number((first as { lon?: unknown }).lon),
  }
  return isCoordinates(coordinates) ? coordinates : null
}
