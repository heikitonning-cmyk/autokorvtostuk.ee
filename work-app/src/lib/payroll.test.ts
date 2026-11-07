import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateTime, parseRate, wageCents, validDate, monthRange, tallinnDate, totals, groupedTotals, type TimeEntry } from './payroll.ts'

test('08–17 less 30 minutes at 12.50 equals 8h30 and 106.25', () => {
  const t = calculateTime('08:00', '17:00', '30')
  assert.equal(t.paidMinutes, 510)
  assert.equal(wageCents(t.paidMinutes, parseRate('12,50')), 10625)
  assert.equal(calculateTime('08:00', '09:00', '').paidMinutes, 60)
})
test('invalid clocks, breaks and reversed times cannot produce wages', () => {
  for (const args of [['24:00','17:00','0'], ['08:00','08:00','0'], ['17:00','08:00','0'], ['08:00','09:00','60'], ['08:00','09:00','-1'], ['08:00','09:00','1.5']]) {
    assert.throws(() => calculateTime(args[0], args[1], args[2]))
  }
  assert.equal(calculateTime('22:00','06:00','30', true).paidMinutes, 450)
  assert.throws(() => calculateTime('08:00','17:00','0', true))
})
test('rate parsing is exact and rejects invalid or nonpositive rates', () => {
  assert.equal(parseRate(' 15.05 '), 1505)
  assert.equal(parseRate('0,01'), 1)
  for (const rate of ['', '0', '-1', '12.345', 'Infinity', '1e2', '10000']) assert.throws(() => parseRate(rate))
  assert.equal(wageCents(1, 100), 2)
  assert.equal(wageCents(1, 30), 1)
})
test('month boundaries and Tallinn date are stable across year and UTC boundaries', () => {
  assert.deepEqual(monthRange('2026-12'), {from:'2026-12-01', to:'2027-01-01'})
  assert.deepEqual(monthRange('2028-02'), {from:'2028-02-01', to:'2028-03-01'})
  assert.equal(tallinnDate(new Date('2026-11-06T23:30:00Z')), '2026-11-07')
  assert.equal(validDate('2026-02-29'), false)
  assert.equal(validDate('2028-02-29'), true)
  assert.throws(() => monthRange('2026-13'))
})
test('summaries add saved entry cents, preserving different historical rates', () => {
  const rows = [
    { employee_id:'a', site_id:'s1', paid_minutes:1, wage_cents:2 },
    { employee_id:'a', site_id:'s2', paid_minutes:1, wage_cents:3 },
    { employee_id:'b', site_id:'s1', paid_minutes:60, wage_cents:2000 },
  ] as TimeEntry[]
  assert.deepEqual(totals(rows), {minutes:62, cents:2005})
  assert.deepEqual(groupedTotals(rows,'employee_id'), [{id:'a',minutes:2,cents:5},{id:'b',minutes:60,cents:2000}])
  assert.deepEqual(groupedTotals(rows,'site_id'), [{id:'s1',minutes:61,cents:2002},{id:'s2',minutes:1,cents:3}])
})
