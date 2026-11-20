import test from 'node:test'
import assert from 'node:assert/strict'
import {payrollRateForDate} from './payroll-rates.ts'
test('rate preview uses date boundaries, historical fallback and latest correction',()=>{
 const e={hourly_rate_cents:1800,rate_history:[{effective_from:'2026-01-04',hourly_rate_cents:1800,previous_rate_cents:1200},{effective_from:'2026-01-02',hourly_rate_cents:1500,previous_rate_cents:1200}]}
 assert.equal(payrollRateForDate(e,'2026-01-01'),1200)
 assert.equal(payrollRateForDate(e,'2026-01-01',1100),1100)
 assert.equal(payrollRateForDate(e,'2026-01-02',1200),1500)
 assert.equal(payrollRateForDate(e,'2026-01-03'),1500)
 assert.equal(payrollRateForDate(e,'2026-01-04'),1800)
 assert.equal(payrollRateForDate({hourly_rate_cents:1300},'2026-01-01'),1300)
})
