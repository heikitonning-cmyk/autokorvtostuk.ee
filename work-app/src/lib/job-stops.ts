import type { JobStopStatus } from './domain.ts'

export type SiteOption = {
  id: string
  customer_id: string
  name: string
  address: string | null
  city?: string | null
  county?: string | null
  requires_lift?: boolean | null
  service_notes?: string | null
}

const normalize = (value: string | null | undefined) =>
  String(value ?? '').trim().toLocaleLowerCase('et-EE')

export function filterSites<T extends SiteOption>(sites: T[], query: string, region: string): T[] {
  const needle = normalize(query)
  const regionNeedle = normalize(region)

  return sites.filter((site) => {
    const searchable = [site.name, site.address, site.city, site.county]
      .map(normalize)
      .join(' ')
    const queryMatches = !needle || searchable.includes(needle)
    const regionMatches = !regionNeedle
      || normalize(site.city) === regionNeedle
      || normalize(site.county) === regionNeedle
    return queryMatches && regionMatches
  })
}

export const isStopTerminal = (status: JobStopStatus) =>
  status === 'done' || status === 'skipped'

export const canFinishStops = (stops: Array<{ status: JobStopStatus }>) =>
  stops.length > 0 && stops.every((stop) => isStopTerminal(stop.status))

export const nextPendingStop = <T extends { status: JobStopStatus; sequence_no: number }>(stops: T[]): T | null =>
  [...stops]
    .sort((a, b) => a.sequence_no - b.sequence_no)
    .find((stop) => stop.status === 'pending') ?? null

export const wazeUrl = (address: string) =>
  `https://www.waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`
