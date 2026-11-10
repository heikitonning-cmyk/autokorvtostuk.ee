export type DispatchEmployee = { id: string; name: string; active: boolean; hourly_rate_cents: number }
export type DispatchSite = { id: string; customer_id: string; name: string; address: string; source?: string | null }

export function visibleDispatchSites(sites: DispatchSite[], showNeste: boolean, search: string) {
  const query = search.trim().toLocaleLowerCase('et')
  return sites.filter(site => (showNeste || !(site.source?.toLowerCase().includes('neste') || site.name.toLowerCase().includes('neste'))) &&
    `${site.name} ${site.address}`.toLocaleLowerCase('et').includes(query))
}

export function minuteTime(value: number | null | undefined) {
  return value == null ? '' : `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

export function timeMinute(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
}

export function driverTimePreview(start: string, end: string, nextDay: boolean, pause: string, rate: number) {
  const from = timeMinute(start), to = timeMinute(end)
  if (from == null || to == null || !/^\d+$/.test(pause)) return null
  const duration = to + (nextDay ? 1440 : 0) - from
  const minutes = duration - Number(pause)
  if (duration <= 0 || duration > 1440 || minutes <= 0) return null
  return { minutes, cents: Math.round(minutes * rate / 60) }
}
