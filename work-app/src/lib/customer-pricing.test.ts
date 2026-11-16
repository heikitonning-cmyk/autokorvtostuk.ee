import test from 'node:test'
import assert from 'node:assert/strict'
import { customerPrice,defaultCustomerPricing,initialCustomerPricing,appointmentMinutes } from './customer-pricing.ts'
const settings={hourlyRate:45,driverHourlyRate:0,minimumOrder:90,driveHourlyRate:45,kmRate:1,helperHourlyRate:35,operatorWorkHourlyRate:15}
test('70-minute appointment shows actual time, minimum and optional labour independently',()=>{
  const p=defaultCustomerPricing(settings)
  assert.equal(appointmentMinutes('09:30','10:40'),70)
  assert.deepEqual(customerPrice(p,'09:30','10:40'),{actualMinutes:70,minutes:70,lift:5250,driver:0,operator:0,helper:0,drive:0,distance:0,minimumTopUp:3750,calculated:9000,total:9000})
  const withCrew=customerPrice({...p,operator_work:true,helper_count:2},'09:30','10:40')
  assert.equal(withCrew.operator,1750);assert.equal(withCrew.helper,8167);assert.equal(withCrew.total,15167)
})
test('special rates, separate driver, hours and fixed agreement override only this object',()=>{
  const p={...defaultCustomerPricing(settings),lift_rate:4000,driver_rate:1000,minimum:0,operator_work:true,operator_minutes:60,helper_count:2,helper_minutes:30,billed_minutes:120,drive_minutes:30,km:12.5,adjustment:-500}
  const result=customerPrice(p,'09:30','10:40')
  assert.equal(result.actualMinutes,70);assert.equal(result.minutes,120);assert.equal(result.total,18000)
  assert.equal(customerPrice({...p,agreed_total:15000},'09:30','10:40').total,15000)
  assert.equal(defaultCustomerPricing(settings).lift_rate,4500)
})
test('saved prices and imported quotes survive general-rate changes and contact edits',()=>{
  const p={...defaultCustomerPricing(settings),helper_count:1}
  assert.deepEqual(initialCustomerPricing({customer_pricing:p},{...settings,hourlyRate:60}),p)
  const imported=initialCustomerPricing({estimated_total:123.45,estimated_hours:2,estimated_helper_hours:1,estimated_drive_hours:0.5,estimated_km:12,operator_does_work:true},settings)
  assert.equal(customerPrice(imported,'08:00','09:00').total,12345)
  assert.equal(imported.billed_minutes,120);assert.equal(imported.helper_minutes,60)
})
test('unknown times remain unpriced unless a duration or fixed quote is provided; zero is a valid free agreement',()=>{
  const p=defaultCustomerPricing(settings)
  assert.equal(customerPrice(p,'','').total,null)
  assert.equal(customerPrice({...p,agreed_total:0},'','').total,0)
  assert.equal(customerPrice({...p,billed_minutes:120},'','').total,9000)
})
test('invalid rates, minutes, counts, fractions and oversized prices fail rather than silently changing values',()=>{
  for(const patch of [{lift_rate:-1},{operator_rate:1.5},{helper_count:51},{helper_count:1.5},{km:1.234},{minimum:null},{billed_minutes:0},{helper_minutes:1441},{agreed_total:-1},{operator_work:'yes'},{version:'1'}]) {
    assert.throws(()=>customerPrice({...defaultCustomerPricing(settings),...patch} as any,'08:00','15:00'))
  }
})
