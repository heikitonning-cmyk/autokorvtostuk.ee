import type { RoutePoint } from './types.ts'
import { isCoordinates, normalizeAddress, type Coordinates, type ResolvedRoutePoint } from './coordinates.ts'

export type GeocodeGateway = (address: string) => Promise<Coordinates | null>

export interface GeocodeStore {
  get(normalizedAddress: string): Promise<Coordinates | null>
  save(input: {
    normalizedAddress: string
    address: string
    coordinates: Coordinates
    siteId?: string | null
    stopId?: string | null
  }): Promise<void>
}

export async function resolveCoordinates(input: {
  point: RoutePoint
  siteId?: string | null
  stopId?: string | null
  snapshot?: Coordinates | null
  store: GeocodeStore
  geocode: GeocodeGateway
}): Promise<ResolvedRoutePoint> {
  const { point, siteId, stopId, store, geocode } = input
  if (isCoordinates(input.snapshot)) return { ...point, ...input.snapshot }

  const address = point.address.trim()
  if (!address) throw new Error('geocode-failed')
  const normalizedAddress = normalizeAddress(address)

  const cached = await store.get(normalizedAddress)
  if (isCoordinates(cached)) return { ...point, ...cached }

  const coordinates = await geocode(address)
  if (!isCoordinates(coordinates)) throw new Error('geocode-failed')

  await store.save({ normalizedAddress, address, coordinates, siteId, stopId })
  return { ...point, ...coordinates }
}
