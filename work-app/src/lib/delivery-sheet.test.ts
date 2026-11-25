import test from 'node:test'
import assert from 'node:assert/strict'
import { deliverySnapshot, sheetDefaults, validateSheetInput, validateSignature, type SheetInput } from './delivery-sheet.ts'
import { defaultCustomerPricing } from './customer-pricing.ts'
const settings={hourlyRate:45,driverHourlyRate:0,minimumOrder:90,driveHourlyRate:45,kmRate:1,helperHourlyRate:35,operatorWorkHourlyRate:15}
const job={id:'test-job',planned_date:'2026-11-25',planned_time:'10:00',planned_end_time:'11:00',address:'Test 1',payer_name:'Tellija OÜ',customer_pricing:defaultCustomerPricing(settings)}
const input:SheetInput={...sheetDefaults(job),signer:'Test',transport:'km',km:28,operatorWork:true}
test('45 + 15 + 28 is topped up only to 90, never 105',()=>{
  const s=deliverySnapshot(job,settings,input)
  assert.equal(s.total,9000);assert.equal(s.rows.find(r=>r.label==='Miinimumtasu täitmine')?.amount,200)
  assert.equal(s.rows.reduce((n,r)=>n+r.amount,0),s.total)
})
test('city round trip is one package, excludes any old distance',()=>{
  const s=deliverySnapshot(job,settings,{...input,transport:'city',end:'14:00'})
  assert.equal(s.total,28500);assert.equal(s.pricing.km,0);assert.equal(s.rows[0].quantity,1);assert.equal(s.rows[0].amount,4500)
})
test('actual duration replaces saved billing minute overrides without mutating job or payroll',()=>{
  const original=JSON.stringify(job)
  const s=deliverySnapshot({...job,customer_pricing:{...job.customer_pricing,billed_minutes:120,operator_minutes:120}},settings,{...input,end:'12:00'})
  assert.equal(s.minutes,120);assert.equal(s.total,14800);assert.equal(JSON.stringify(job),original)
})
test('overnight duration is explicit and invalid times are rejected',()=>{
  assert.equal(deliverySnapshot(job,settings,{...input,start:'23:30',end:'01:00',nextDay:true}).minutes,90)
  assert.throws(()=>deliverySnapshot(job,settings,{...input,start:'12:00',end:'11:00'}))
  assert.throws(()=>deliverySnapshot(job,settings,{...input,start:'10:00',end:'14:00',nextDay:true}))
})
test('agreed price and custom service rates are preserved and rows reconcile',()=>{
  const s=deliverySnapshot({...job,customer_pricing:{...job.customer_pricing,lift_rate:5000,agreed_total:15000}},settings,input)
  assert.equal(s.total,15000);assert.equal(s.rows.reduce((n,r)=>n+r.amount,0),15000)
  assert.equal(s.rows.find(r=>r.label==='Tõstukitööd')?.rate,5000)
})
test('missing customer, invalid dates and distance cannot be signed',()=>{
  for(const patch of [{customer:''},{signer:''},{date:'2026-02-30'},{km:-1},{km:0},{km:NaN},{start:'24:00'}]) assert.throws(()=>validateSheetInput({...input,...patch}))
})
test('signature rejects blank, nonnumeric, oversized and out-of-bounds strokes',()=>{
  for(const value of [[],[[[1,1]]],[[[0,0],[700,100],[1,1]]],[[[0,0],['x',1],[20,20]]],Array(101).fill([[0,0],[20,20]])]) assert.throws(()=>validateSignature(value))
  assert.deepEqual(validateSignature([[[0,0],[10,10],[20,5]]]),[[[0,0],[10,10],[20,5]]])
})
