import type { PriceBreakdown, PriceInput, PriceSettings, PriceSnapshot } from './domain.ts'

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function getJobPricing(job: any, current: PriceSettings): PriceSettings {
  const rates = { ...current, ...(job.price_snapshot_json ?? {}) }
  const importedRate = job.operator_does_work && Number(job.estimated_hours) > 0 && job.operator_work_surcharge != null
    ? Number(job.operator_work_surcharge) / Number(job.estimated_hours) : undefined
  rates.operatorWorkHourlyRate = job.operator_work_hourly_rate
    ?? job.price_snapshot_json?.operatorWorkHourlyRate
    ?? importedRate
    ?? (job.source === 'website' || job.price_snapshot_json ? 15 : current.operatorWorkHourlyRate ?? 15)
  return rates
}

export function calculateJobEstimate(job: any, input: PriceInput, settings: PriceSettings): PriceBreakdown {
  const price = calculatePrice(input, settings)
  // Contact-only edits and toggling optional labour must preserve an agreed base quote.
  const unchanged = job.estimated_total != null
    && input.liftHours === Number(job.estimated_hours ?? 0)
    && input.driveHours === Number(job.estimated_drive_hours ?? 0)
    && input.km === Number(job.estimated_km ?? 0)
    && input.helperHours === Number(job.estimated_helper_hours ?? 0)
    && input.adjustment === Number(job.manual_adjustment ?? 0)
  if (unchanged) {
    const previousFee = job.operator_does_work ? Number(job.operator_work_surcharge ?? 0) : 0
    price.total = money(Math.max(0, Number(job.estimated_total) - previousFee + price.operatorWork))
  }
  return price
}

export function calculatePrice(input: PriceInput, settings: PriceSettings): PriceBreakdown {
  const lift = money(Math.max(0, input.liftHours) * settings.hourlyRate)
  const drive = money(Math.max(0, input.driveHours) * settings.driveHourlyRate)
  const distance = money(Math.max(0, input.km) * settings.kmRate)
  const helper = money(Math.max(0, input.helperHours) * settings.helperHourlyRate)
  const operatorWork = input.operatorDoesWork
    ? money(Math.max(0, input.operatorWorkHours ?? input.liftHours) * (settings.operatorWorkHourlyRate ?? 15))
    : 0
  const adjustment = money(input.adjustment)
  const subtotal = money(lift + drive + distance + helper + adjustment)
  const total = money(Math.max(settings.minimumOrder, subtotal) + operatorWork)

  return { lift, drive, distance, helper, operatorWork, adjustment, subtotal: money(subtotal + operatorWork), total }
}

export function createPriceSnapshot(settings: PriceSettings, capturedAt = new Date().toISOString()): PriceSnapshot {
  return {
    hourlyRate: settings.hourlyRate,
    minimumOrder: settings.minimumOrder,
    driveHourlyRate: settings.driveHourlyRate,
    kmRate: settings.kmRate,
    helperHourlyRate: settings.helperHourlyRate,
    operatorWorkHourlyRate: settings.operatorWorkHourlyRate ?? 15,
    capturedAt,
  }
}
