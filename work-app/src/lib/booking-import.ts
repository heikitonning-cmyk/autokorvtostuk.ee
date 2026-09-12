export interface ConfirmedBookingInput {
  externalRef: string
  plannedDate: string
  plannedTime?: string | null
  objectName?: string | null
  address?: string | null
  workType?: string | null
  estimatedHours?: number | null
  estimatedTotal?: number | null
  description?: string | null
  helperCount?: number | null
}

export interface ConfirmedBooking {
  externalRef: string
  plannedDate: string
  plannedTime: string | null
  objectName: string | null
  address: string | null
  workType: string | null
  estimatedHours: number
  estimatedTotal: number | null
  description: string | null
  helperCount: number
}

const optionalText = (value: unknown): string | null => {
  const text = String(value ?? '').trim()
  return text || null
}

function validIsoDate(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return false
  const [, year, month, day] = match
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return parsed.getUTCFullYear() === Number(year)
    && parsed.getUTCMonth() === Number(month) - 1
    && parsed.getUTCDate() === Number(day)
}

function validTime(value: string): boolean {
  const match = value.match(/^(\d{2}):(\d{2})$/)
  return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59)
}

export function normalizeConfirmedBooking(input: ConfirmedBookingInput): ConfirmedBooking {
  const externalRef = String(input.externalRef ?? '').trim().toUpperCase()
  if (!/^AT-\d+$/.test(externalRef)) throw new Error('externalRef must use AT-<number> format')

  const plannedDate = String(input.plannedDate ?? '').trim()
  if (!validIsoDate(plannedDate)) throw new Error('plannedDate must use YYYY-MM-DD format')

  const plannedTimeText = optionalText(input.plannedTime)
  if (plannedTimeText && !validTime(plannedTimeText)) throw new Error('plannedTime must use HH:MM format')

  const estimatedHours = input.estimatedHours == null ? 2 : Number(input.estimatedHours)
  if (!Number.isFinite(estimatedHours) || estimatedHours <= 0) throw new Error('estimatedHours must be a positive number')

  const estimatedTotal = input.estimatedTotal == null ? null : Number(input.estimatedTotal)
  if (estimatedTotal !== null && (!Number.isFinite(estimatedTotal) || estimatedTotal < 0)) {
    throw new Error('estimatedTotal must be a non-negative number')
  }

  const helperCount = input.helperCount == null ? 0 : Number(input.helperCount)
  if (!Number.isInteger(helperCount) || helperCount < 0) throw new Error('helperCount must be a non-negative integer')

  return {
    externalRef,
    plannedDate,
    plannedTime: plannedTimeText,
    objectName: optionalText(input.objectName),
    address: optionalText(input.address),
    workType: optionalText(input.workType),
    estimatedHours,
    estimatedTotal,
    description: optionalText(input.description),
    helperCount,
  }
}

function parseNumber(value: string): number | undefined {
  const parsed = Number(value.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : undefined
}

export function parseBookingEmail(text: string): Partial<ConfirmedBookingInput> {
  const result: Partial<ConfirmedBookingInput> = {}

  const refMatch = text.match(/Viide:\s*(AT-\d+)/i)
  if (refMatch) result.externalRef = refMatch[1].toUpperCase()

  const scheduleMatch = text.match(/(?:Soovitud aeg|Aeg):\s*(\d{4}-\d{2}-\d{2})(?:\s+kell\s+(\d{2}:\d{2}))?/i)
  if (scheduleMatch) {
    result.plannedDate = scheduleMatch[1]
    if (scheduleMatch[2]) result.plannedTime = scheduleMatch[2]
  }

  const workMatch = text.match(/^Töö:\s*(.+)$/im)
  if (workMatch) {
    const parts = workMatch[1].split('·').map((part) => part.trim()).filter(Boolean)
    if (parts[0]) result.workType = parts[0]
    const hoursPart = parts.find((part) => /\d+(?:[.,]\d+)?\s*h\b/i.test(part))
    const hoursMatch = hoursPart?.match(/(\d+(?:[.,]\d+)?)\s*h\b/i)
    if (hoursMatch) result.estimatedHours = parseNumber(hoursMatch[1])
    if (parts.some((part) => /ilma\s+lisatöömeheta/i.test(part))) result.helperCount = 0
  }

  const objectMatch = text.match(/^Objekt:\s*(.+)$/im)
  if (objectMatch) result.objectName = objectMatch[1].trim()

  const totalMatch = text.match(/^Ligikaudne maksumus:\s*([\d\s.,]+)\s*€/im)
  if (totalMatch) result.estimatedTotal = parseNumber(totalMatch[1])

  return result
}
