import type { PriceBreakdown, PriceInput, PriceSettings, PriceSnapshot } from './domain.ts'

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function calculatePrice(input: PriceInput, settings: PriceSettings): PriceBreakdown {
  const lift = money(Math.max(0, input.liftHours) * settings.hourlyRate)
  const drive = money(Math.max(0, input.driveHours) * settings.driveHourlyRate)
  const distance = money(Math.max(0, input.km) * settings.kmRate)
  const helper = money(Math.max(0, input.helperHours) * settings.helperHourlyRate)
  const adjustment = money(input.adjustment)
  const subtotal = money(lift + drive + distance + helper + adjustment)
  const total = money(Math.max(settings.minimumOrder, subtotal))

  return { lift, drive, distance, helper, adjustment, subtotal, total }
}

export function createPriceSnapshot(settings: PriceSettings, capturedAt = new Date().toISOString()): PriceSnapshot {
  return {
    hourlyRate: settings.hourlyRate,
    minimumOrder: settings.minimumOrder,
    driveHourlyRate: settings.driveHourlyRate,
    kmRate: settings.kmRate,
    helperHourlyRate: settings.helperHourlyRate,
    capturedAt,
  }
}
