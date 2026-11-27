import test from 'node:test'
import assert from 'node:assert/strict'
import { payrollPeriod, periodEntries, periodPayments } from './payroll-period.ts'
const entries = [
  { work_date: '2026-10-31', paid_minutes: 60, wage_cents: 1300 },
  { work_date: '2026-11-01', paid_minutes: 90, wage_cents: 1950 },
  { work_date: '2026-11-15', paid_minutes: 60, wage_cents: 1500 },
  { work_date: '2026-11-15', paid_minutes: 30, wage_cents: 750 },
  { work_date: '2026-11-16', paid_minutes: null, wage_cents: null },
]
test('inclusive range totals stored wages at different rates, counts distinct work dates', () => {
  const before = JSON.stringify(entries)
  const result = periodEntries(entries, payrollPeriod('2026-11-01', '2026-11-15'))
  assert.equal(result.entries.length, 3)
  assert.equal(result.days, 2)
  assert.equal(result.minutes, 180)
  assert.equal(result.cents, 4200)
  assert.equal(JSON.stringify(entries), before)
})
test('one-sided, cleared and empty ranges; unfinished time excluded from earned total', () => {
  assert.equal(periodEntries(entries, payrollPeriod(undefined, undefined)).cents, 5500)
  assert.equal(periodEntries(entries, payrollPeriod('2026-11-15', '')).running, 1)
  assert.equal(periodEntries(entries, payrollPeriod('', '2026-10-31')).minutes, 60)
  assert.equal(periodEntries(entries, payrollPeriod('2027-01-01', '')).days, 0)
})
test('invalid and reversed ranges do not silently display all entries', () => {
  for (const [from, to] of [['2026-02-30', ''], ['2026-11-15', '2026-11-01'], [['2026-11-01'], '']]) {
    const period = payrollPeriod(from, to)
    assert.ok(period.error)
    assert.equal(periodEntries(entries, period).entries.length, 0)
  }
  assert.equal(payrollPeriod('2028-02-29', '2028-02-29').error, '')
})

test('period balance uses inclusive paid dates, excludes voided payments and preserves negative balances', () => {
  const payments = [
    {paid_date:'2026-10-31',amount_cents:1000,voided_at:null},
    {paid_date:'2026-11-01',amount_cents:2000,voided_at:null},
    {paid_date:'2026-11-15',amount_cents:3000,voided_at:null},
    {paid_date:'2026-11-15',amount_cents:9000,voided_at:'2026-11-16'},
    {paid_date:'2026-11-16',amount_cents:4000,voided_at:null},
  ]
  const before=JSON.stringify(payments), period=payrollPeriod('2026-11-01','2026-11-15')
  assert.equal(periodPayments(payments,period),5000)
  assert.equal(periodEntries(entries,period).cents-periodPayments(payments,period),-800)
  assert.equal(periodPayments(payments,payrollPeriod('', '')),10000)
  assert.equal(periodPayments(payments,payrollPeriod('2027-01-01', '')),0)
  assert.equal(periodPayments(payments,payrollPeriod('', '2026-10-31')),1000)
  assert.equal(periodPayments(payments,payrollPeriod('bad', '')),0)
  assert.equal(periodPayments([],period),0)
  assert.equal(JSON.stringify(payments),before)
})
