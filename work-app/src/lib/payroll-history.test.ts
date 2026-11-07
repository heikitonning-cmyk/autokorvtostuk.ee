import test from 'node:test'
import assert from 'node:assert/strict'
import { payrollHistoryParams, payrollHistoryRange, payrollHistoryUrl } from './payroll-history.ts'
const employee='20000000-0000-4000-8000-000000000001'

test('all-day history has no month bounds and keeps the selected employee',()=>{
  const history=payrollHistoryParams({month:'2026-11',employee,scope:'all'},'2026-11')
  assert.equal(history.employeeId,employee)
  assert.equal(payrollHistoryRange(history),null)
  assert.deepEqual(payrollHistoryRange({...history,allDays:false}),{from:'2026-11-01',to:'2026-12-01'})
})
test('history navigation validates malformed query values',()=>{
  for(const month of ['2026-13','2026-02-31',['2026-11'],'bad']){
    const history=payrollHistoryParams({month,employee:'bad',scope:['all']},'2026-11')
    assert.deepEqual(history,{month:'2026-11',employeeId:'',allDays:false})
  }
  assert.equal(payrollHistoryParams({scope:'all'},'2026-11').employeeId,'')
})
test('editing an older day returns to the same person and whole-history list',()=>{
  const context=payrollHistoryParams({month:'2026-11',employee,scope:'all'},'2025-12')
  const url=payrollHistoryUrl(context,'1234')
  assert.ok(url.startsWith('/manager/time?'))
  const query=Object.fromEntries(new URL(url,'https://example.test').searchParams)
  assert.equal(query.view,'summary')
  assert.equal(query.saved,'1234')
  assert.deepEqual(payrollHistoryParams(query,'2025-12'),context)
})
