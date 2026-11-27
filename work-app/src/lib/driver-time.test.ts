import test from 'node:test'
import assert from 'node:assert/strict'
import {driverWorkers,suggestedDriverTime} from './driver-time.ts'
import {calculateTime,wageCents} from './payroll.ts'
import {applySharedTime,type WorkerDraft} from './work-days.ts'
const job=(start='10:00',end='12:00',driver='sten')=>({driver_employee_id:driver,planned_time:start,planned_end_time:end})
const worker:WorkerDraft={id:'sten',start:'08:00',end:'15:00',pause:'0',overnight:false,override:false}
test('customer 10–12 defaults to paid driver 09:30–12:30 and 39 euros at 13/h',()=>{
 const result=driverWorkers([worker],[job()],{},[])
 assert.equal(result.length,1)
 assert.equal(result[0].start,'09:30')
 assert.equal(result[0].end,'12:30')
 assert.equal(result[0].override,true)
 const t=calculateTime(result[0].start,result[0].end,result[0].pause)
 assert.equal(t.paidMinutes,180)
 assert.equal(wageCents(t.paidMinutes,1300),3900)
 assert.equal(worker.start,'08:00')
 assert.equal(suggestedDriverTime([job('10:00','14:00')],'sten').time?.end,'14:30')
})
test('multiple objects yield one driver span and independent other driver',()=>{
 const result=driverWorkers([worker,{...worker,id:'other'}],[job(),job('14:00','16:00'),job('11:00','13:00','other')],{},[])
 assert.equal(result.length,2)
 assert.equal(result[0].start,'09:30')
 assert.equal(result[0].end,'16:30')
 assert.equal(calculateTime(result[0].start,result[0].end,'0').paidMinutes,420)
 assert.equal(result[1].start,'10:30')
 assert.equal(result[1].end,'13:30')
})
test('saved and manually changed hours are preserved; explicit reset restores suggestion',()=>{
 const manual={...worker,start:'09:15',end:'13:00',pause:'15',override:true}
 assert.deepEqual(driverWorkers([manual],[job()],{},['sten']),[manual])
 assert.deepEqual(driverWorkers([manual],[job()],{sten:true},[]),[manual])
 const reset=driverWorkers([manual],[job()],{sten:false},['sten'])[0]
 assert.equal(reset.start,'09:30')
 assert.equal(reset.end,'12:30')
 assert.equal(reset.pause,'15')
 const shared={start:'07:00',end:'17:00',pause:'30',overnight:false}
 const day=applySharedTime([reset],shared)
 assert.deepEqual(driverWorkers(day,[job()],{sten:true},[]),day)
})
test('invalid or incomplete appointments cannot invent a driver span',()=>{
 for(const j of [job('','12:00'),job('10:00',''),job('24:00','12:00'),job('12:00','10:00'),job('10:00','10:00'),job('00:15','02:00')]){
  assert.equal(suggestedDriverTime([j],'sten').time,null)
  assert.deepEqual(driverWorkers([worker],[j],{},[]),[worker])
 }
 assert.equal(suggestedDriverTime([job()],'missing').time,null)
})
test('late finish crosses midnight explicitly and retains correct duration',()=>{
 const time=suggestedDriverTime([job('22:00','23:45')],'sten').time!
 assert.deepEqual(time,{start:'21:30',end:'00:15',pause:'0',overnight:true})
 assert.equal(calculateTime(time.start,time.end,time.pause,time.overnight).paidMinutes,165)
})
