import { calculateTime, clock, clockMinutes, wageCents, type TimeEntry } from './payroll.ts'

export type BulkTimePatch = { startMinute: number | null; endMinute: number | null; nextDay: boolean | null; breakMinutes: number | null }
export type EntryVersion = Pick<TimeEntry, 'id' | 'updated_at'>
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseBulkEntries(raw: string): EntryVersion[] {
  let rows: unknown
  try { rows = JSON.parse(raw) } catch { throw new Error('Vali muudetavad tööajakirjed.') }
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 100 || rows.some(e =>
    !e || typeof e.id !== 'string' || !uuid.test(e.id) || typeof e.updated_at !== 'string' || !Number.isFinite(Date.parse(e.updated_at))) ||
    new Set(rows.map(e => e.id.toLowerCase())).size !== rows.length) throw new Error('Vali 1–100 erinevat tööajakirjet.')
  return rows.map(e => ({ id: e.id, updated_at: e.updated_at }))
}

export function parseBulkPatch(form: FormData): BulkTimePatch {
  const startMinute = form.get('changeStart') === 'on' ? clockMinutes(String(form.get('start') ?? '')) : null
  const endMinute = form.get('changeEnd') === 'on' ? clockMinutes(String(form.get('end') ?? '')) : null
  const nextDay = endMinute === null ? null : form.get('nextDay') === 'on'
  let breakMinutes: number | null = null
  if (form.get('changeBreak') === 'on') {
    const raw = String(form.get('lunch') ?? '').trim()
    if (!/^\d{1,4}$/.test(raw) || Number(raw) > 1439) throw new Error('Sisesta lõunapaus minutites (0–1439).')
    breakMinutes = Number(raw)
  }
  if (startMinute === null && endMinute === null && breakMinutes === null) throw new Error('Vali vähemalt üks muudetav väli.')
  return { startMinute, endMinute, nextDay, breakMinutes }
}

export function previewBulkEntry(entry: TimeEntry, patch: BulkTimePatch) {
  if (entry.end_minute === null) throw new Error('Ühiselt saab muuta lõpetatud tööajakirjeid.')
  const start = patch.startMinute ?? entry.start_minute, end = patch.endMinute ?? entry.end_minute
  const nextDay = patch.nextDay ?? entry.next_day, lunch = patch.breakMinutes ?? entry.break_minutes
  const time = calculateTime(clock(start), clock(end), String(lunch), nextDay)
  return { ...time, nextDay, wageCents: wageCents(time.paidMinutes, entry.hourly_rate_cents) }
}
