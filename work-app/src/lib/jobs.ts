export interface NewJobInput {
  customerId: string
  startPlanned: string
  address: string
  workTypeId: string
  operatorId: string
}

export interface FinishJobInput {
  actualKm: number | null
  billingConfirmed: boolean
  photoCount: number
}

export interface SaveErrorLike {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

export function validateNewJob(_input: NewJobInput): (keyof NewJobInput)[] {
  return []
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  ) - date.getTime()
}

export function optionalIsoDateTime(value: FormDataEntryValue | string | null | undefined): string | null {
  const text = String(value ?? '').trim()
  if (!text) return null

  const localMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (localMatch) {
    const [, year, month, day, hour, minute, second = '0'] = localMatch
    const localAsUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
    const zone = 'Europe/Tallinn'
    const firstOffset = timeZoneOffsetMs(new Date(localAsUtc), zone)
    let utc = localAsUtc - firstOffset
    const secondOffset = timeZoneOffsetMs(new Date(utc), zone)
    if (secondOffset !== firstOffset) utc = localAsUtc - secondOffset
    return new Date(utc).toISOString()
  }

  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export function formatPlannedTime(value: string | null | undefined): string {
  if (!value) return 'Aeg määramata'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Aeg määramata'
  return new Intl.DateTimeFormat('et-EE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Tallinn',
  }).format(date)
}

export function formatSaveError(error: SaveErrorLike | Error | string | null | undefined): string {
  if (!error) return 'Tundmatu salvestusviga'
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message || 'Tundmatu salvestusviga'

  const parts = [
    error.code ? `[${error.code}]` : null,
    error.message,
    error.details,
    error.hint ? `Vihje: ${error.hint}` : null,
  ].filter((part): part is string => Boolean(part))
  return parts.join(' · ') || 'Tundmatu salvestusviga'
}

export function validateFinishJob(input: FinishJobInput): ('actualKm' | 'billingConfirmed' | 'photo')[] {
  const missing: ('actualKm' | 'billingConfirmed' | 'photo')[] = []
  if (input.actualKm === null || input.actualKm < 0) missing.push('actualKm')
  if (!input.billingConfirmed) missing.push('billingConfirmed')
  if (input.photoCount < 1) missing.push('photo')
  return missing
}
