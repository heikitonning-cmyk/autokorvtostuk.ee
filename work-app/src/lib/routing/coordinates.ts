import type { RoutePoint } from './types.ts'

export type Coordinates = {
  latitude: number
  longitude: number
}

export type ResolvedRoutePoint = RoutePoint & Coordinates

export function normalizeAddress(address: string) {
  return address.trim().replace(/\s+/g, ' ').toLocaleLowerCase('et-EE')
}

export function isCoordinates(value: unknown): value is Coordinates {
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
