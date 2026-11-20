import test from 'node:test'
import assert from 'node:assert/strict'
import { balanceAfterPayment,balanceTotals,parsePaymentAmount,type PayrollPayment } from './payroll-payments.ts'

test('payment amounts parse exact cents and reject invalid/zero amounts',()=>{
  assert.equal(parsePaymentAmount('500'),50000)
  assert.equal(parsePaymentAmount(' 12,05 '),1205)
  assert.equal(parsePaymentAmount('0.01'),1)
  assert.equal(parsePaymentAmount('999999.99'),99999999)
  for(const amount of ['', '0', '-1', '1e3', '1.001', 'Infinity', '1000000', '12,3.4']) assert.throws(()=>parsePaymentAmount(amount))
})
test('partial payments, advances, and payment corrections update the balance',()=>{
  const balance={employee_id:'a',earned_cents:100000,paid_cents:25000,balance_cents:75000}
  assert.equal(balanceAfterPayment(balance,50000),25000)
  assert.equal(balanceAfterPayment(balance,80000),-5000)
  const previous={employee_id:'a',amount_cents:25000,voided_at:null} as PayrollPayment
  assert.equal(balanceAfterPayment(balance,50000,previous),50000)
  assert.equal(balanceAfterPayment({...balance,employee_id:'b'},50000,previous),25000)
})
test('one worker advance never offsets another worker outstanding pay',()=>{
  assert.deepEqual(balanceTotals([
    {employee_id:'a',earned_cents:10000,paid_cents:0,balance_cents:10000},
    {employee_id:'b',earned_cents:0,paid_cents:10000,balance_cents:-10000},
  ]),{due:10000,advance:10000})
})
