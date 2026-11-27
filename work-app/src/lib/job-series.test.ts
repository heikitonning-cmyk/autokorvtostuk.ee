import test from 'node:test'
import assert from 'node:assert/strict'
import { nextWorkDate,continuationSchedule } from './job-series.ts'
import { seriesDeliverySnapshot,sheetDefaults } from './delivery-sheet.ts'
import { defaultCustomerPricing } from './customer-pricing.ts'
const settings={hourlyRate:45,minimumOrder:90,driveHourlyRate:45,kmRate:1,helperHourlyRate:35,operatorWorkHourlyRate:15}
const jobs=['2026-11-26','2026-11-27'].map((date,i)=>({id:String(i),planned_date:date,planned_time:'10:00',planned_end_time:i?'12:00':'11:00',payer_name:'Test',customer_pricing:defaultCustomerPricing(settings)}))
const input={...sheetDefaults(jobs[0]),signer:'Test'}
const days=jobs.map(j=>({...sheetDefaults(j),jobId:j.id,transport:'km',km:28,operatorWork:true}))
test('two days sum daily pricing and hours, excluding nights and preserving each minimum',()=>{
 const before=JSON.stringify(jobs),s=seriesDeliverySnapshot(jobs,settings,input,days,'0')
 assert.equal(s.minutes,180);assert.equal(s.total,23800);assert.equal(s.days?.length,2)
 assert.equal(s.rows.reduce((n,r)=>n+r.amount,0),s.total);assert.equal(JSON.stringify(jobs),before)
 assert.throws(()=>seriesDeliverySnapshot(jobs,settings,input,[days[0],days[0]],'0'))
 assert.throws(()=>seriesDeliverySnapshot(jobs,settings,input,days.slice(0,1),'0'))
 assert.throws(()=>seriesDeliverySnapshot(jobs,settings,input,[days[0],{...days[1],date:'2026-11-28'}],'0'))
})
test('next day handles year and month boundaries',()=>{
 assert.equal(nextWorkDate('2026-12-31'),'2027-01-01');assert.equal(nextWorkDate('2028-02-28'),'2028-02-29')
})
test('copying into an occupied day retains its existing schedule',()=>{
 const empty={date:'2026-11-27',day:null,jobs:[],entries:[]}
 const source={...empty,date:'2026-11-26',day:{id:'a',work_date:'2026-11-26',start_minute:540,end_minute:960,break_minutes:30,next_day:false,revision:1}}
 assert.equal(continuationSchedule(empty,source).day.start,'09:00')
 const occupied={...empty,day:{...source.day,id:'b',start_minute:480}}
 assert.equal(continuationSchedule(occupied,source).day.start,'08:00')
})
