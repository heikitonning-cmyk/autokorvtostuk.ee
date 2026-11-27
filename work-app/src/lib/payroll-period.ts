import { validDate, totals, type TimeEntry } from './payroll.ts'

type QueryValue = string | string[] | undefined
export function payrollPeriod(from: QueryValue, to: QueryValue) {
  const start = typeof from === 'string' ? from : ''
  const end = typeof to === 'string' ? to : ''
  const error = (from !== undefined && typeof from !== 'string') || (to !== undefined && typeof to !== 'string') ||
    (start && !validDate(start)) || (end && !validDate(end))
    ? 'Vali korrektsed kuupäevad.'
    : start && end && start > end ? 'Lõppkuupäev peab olema alguskuupäeval või hiljem.' : ''
  return { from: validDate(start) ? start : '', to: validDate(end) ? end : '', error }
}
export function periodEntries<T extends Pick<TimeEntry, 'work_date' | 'paid_minutes' | 'wage_cents'>>(entries: T[], period: ReturnType<typeof payrollPeriod>) {
  const visible = period.error ? [] : entries.filter(e => (!period.from || e.work_date >= period.from) && (!period.to || e.work_date <= period.to))
  const finished = visible.filter(e => e.paid_minutes !== null && e.wage_cents !== null)
  return { entries: visible, ...totals(finished), days: new Set(visible.map(e => e.work_date)).size, running: visible.length - finished.length }
}

/** Payments follow their paid date, not the work dates they may settle. */
export function periodPayments(payments: { paid_date: string; amount_cents: number; voided_at: string | null }[], period: ReturnType<typeof payrollPeriod>) {
  if (period.error) return 0
  return payments.filter(p => !p.voided_at && (!period.from || p.paid_date >= period.from) && (!period.to || p.paid_date <= period.to)).reduce((sum, p) => sum + p.amount_cents, 0)
}
