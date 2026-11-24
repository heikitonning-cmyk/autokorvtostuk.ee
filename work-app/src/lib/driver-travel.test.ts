import test from 'node:test'
import assert from 'node:assert/strict'
import { driverDayWithTravel } from './driver-travel.ts'
const job=(start:string,end:string,driver='sten')=>({driver_employee_id:driver,planned_time:start,planned_end_time:end})
test('45 minutes before first and after last object, independent of object order',()=>{
 assert.deepEqual(driverDayWithTravel([job('14:00','15:00'),job('10:00','13:00'),job('07:00','20:00','other')],'sten'),{start:'09:15',end:'15:45',overnight:false})
})
test('one object and repeated clicks use customer times, never accumulate padding',()=>{
 const jobs=[job('10:00','13:00')]
 const expected={start:'09:15',end:'13:45',overnight:false}
 assert.deepEqual(driverDayWithTravel(jobs,'sten'),expected)
 assert.deepEqual(driverDayWithTravel(jobs,'sten'),expected)
 assert.equal(jobs[0].planned_time,'10:00')
})
test('overnight and midnight arrival are represented correctly',()=>{
 assert.deepEqual(driverDayWithTravel([job('22:00','01:00')],'sten'),{start:'21:15',end:'01:45',overnight:true})
 assert.deepEqual(driverDayWithTravel([job('20:00','23:15')],'sten'),{start:'19:15',end:'00:00',overnight:true})
})
test('missing times and unsupported day boundaries fail without guessing',()=>{
 for(const jobs of [[],[job('10:00','')],[job('10:00','10:00')],[job('00:30','02:00')],[job('01:00','00:30')]]) assert.throws(()=>driverDayWithTravel(jobs,'sten'))
})
