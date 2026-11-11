/** Wage calculations use whole minutes and cents; no tax or billing logic. */
export type Employee = { id: string; name: string; hourly_rate_cents: number; active: boolean; updated_at: string }
export type PayrollSite = { id: string; name: string; customer_id: string; active: boolean }
export type TimeEntry = {
  id: string; employee_id: string; site_id: string | null; work_date: string
  sites?: { site_id: string }[]
  job?: { address: string | null } | null
  start_minute: number; end_minute: number | null; next_day: boolean; break_minutes: number
  hourly_rate_cents: number; paid_minutes: number | null; wage_cents: number | null; note: string
  updated_at: string
}
export type ActionState = { error?: string; success?: string; savedId?: string; savedVersion?: string }

export function parseRate(value: string): number {
  const normalized = value.trim().replace(',', '.')
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(normalized)) throw new Error('Sisesta tunnihind kuni kahe komakohaga.')
  const [whole, fraction = ''] = normalized.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (cents <= 0 || cents > 999999) throw new Error('Tunnihind peab olema suurem kui 0 ja kuni 9999,99 €.')
  return cents
}

export function clockMinutes(value: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Sisesta korrektne algus- ja lõpuaeg.')
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}

export function clock(minutes: number): string {
  return `${Math.floor(minutes / 60)}`.padStart(2, '0') + ':' + `${minutes % 60}`.padStart(2, '0')
}

export function calculateTime(start: string, end: string, lunch: string, nextDay = false) {
  const startMinute = clockMinutes(start), endMinute = clockMinutes(end)
  const rawBreak = lunch.trim() || '0'
  if (!/^\d{1,4}$/.test(rawBreak)) throw new Error('Lõunapaus peab olema täisarv minutites.')
  const breakMinutes = Number(rawBreak)
  const elapsed = endMinute + (nextDay ? 1440 : 0) - startMinute
  if (elapsed <= 0 || elapsed > 1440) throw new Error('Lõpp peab olema pärast algust. Öötöö korral märgi „Lõpp järgmisel päeval”.')
  if (breakMinutes >= elapsed) throw new Error('Lõunapaus peab olema tööajast lühem.')
  return { startMinute, endMinute, breakMinutes, paidMinutes: elapsed - breakMinutes }
}

export function wageCents(minutes: number, rate: number): number {
  return Math.floor((minutes * rate + 30) / 60)
}

export function validDate(value: string): boolean {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function tallinnDate(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Tallinn', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function tallinnClock(now = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Tallinn', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
}

export function entrySiteIds(entry: Pick<TimeEntry, 'site_id' | 'sites'>): string[] {
  return [...new Set([...(entry.site_id ? [entry.site_id] : []), ...(entry.sites ?? []).map(s => s.site_id)])]
}

type EntryLocation = Pick<TimeEntry, 'site_id' | 'sites' | 'job'>

export function entryLocation(entry: EntryLocation, siteName: (id: string) => string): string {
  return entry.job?.address?.trim() || entrySiteIds(entry).map(siteName).join(' · ') || 'Objektita'
}

export function matchesEntryLocation(entry: EntryLocation, filter: string): boolean {
  if (!filter) return true
  const address = entry.job?.address?.trim()
  if (filter === 'none') return !address && !entrySiteIds(entry).length
  if (filter.startsWith('address:')) return address === filter.slice(8)
  return entrySiteIds(entry).includes(filter)
}

/** Match entered wall-clock minutes, including the existing overnight convention. */
export function runningMinutes(entry: Pick<TimeEntry, 'work_date' | 'start_minute'>, now: Date): number {
  const days = (Date.parse(`${tallinnDate(now)}T00:00:00Z`) - Date.parse(`${entry.work_date}T00:00:00Z`)) / 86400000
  return Math.max(0, days * 1440 + clockMinutes(tallinnClock(now)) - entry.start_minute)
}

export function monthRange(value: string) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value)) throw new Error('Vali korrektne kuu.')
  const [y, m] = value.split('-').map(Number)
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
  return { from: `${value}-01`, to: next }
}

export function totals(entries: Pick<TimeEntry, 'paid_minutes' | 'wage_cents'>[]) {
  return entries.reduce((sum, e) => ({ minutes: sum.minutes + (e.paid_minutes ?? 0), cents: sum.cents + (e.wage_cents ?? 0) }), { minutes: 0, cents: 0 })
}

export function groupedTotals(entries: TimeEntry[], key: 'employee_id' | 'site_id') {
  const groups = new Map<string, { minutes: number; cents: number }>()
  for (const e of entries) {
    const id = e[key]
    if (!id || e.paid_minutes === null || e.wage_cents === null) continue
    const sum = groups.get(id) ?? { minutes: 0, cents: 0 }
    groups.set(id, { minutes: sum.minutes + e.paid_minutes, cents: sum.cents + e.wage_cents })
  }
  return [...groups].map(([id, sum]) => ({ id, ...sum }))
}

export const euros = (cents: number) => new Intl.NumberFormat('et-EE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
export const hours = (minutes: number) => `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`
