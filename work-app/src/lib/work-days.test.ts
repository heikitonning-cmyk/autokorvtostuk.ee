import test from 'node:test'
import assert from 'node:assert/strict'
import { applySharedTime,timePayload,type WorkerDraft } from './work-days.ts'
import { calculateTime,wageCents } from './payroll.ts'

test('changing the day replaces a stale personal time and updates wages',()=>{
  const workers:WorkerDraft[]=[{id:'sten',start:'08:30',end:'10:30',pause:'0',overnight:false,override:true}]
  const shared={start:'09:30',end:'14:00',pause:'0',overnight:false}
  const [updated]=applySharedTime(workers,shared)
  assert.equal(updated.override,false)
  assert.deepEqual(timePayload(updated),{start_minute:570,end_minute:840,break_minutes:0,next_day:false})
  const minutes=calculateTime(updated.start,updated.end,updated.pause,updated.overnight).paidMinutes
  assert.equal(minutes,270)
  assert.equal(wageCents(minutes,1300),5850)
  assert.equal(workers[0].start,'08:30')
})
test('shared pauses and overnight time apply to every worker while keeping their identity and rate',()=>{
  const workers:WorkerDraft[]=[
    {id:'a',start:'08:00',end:'10:00',pause:'0',overnight:false,override:true},
    {id:'b',start:'08:00',end:'10:00',pause:'0',overnight:false,override:false,is_new:true,name:'New',rate:'15'},
  ]
  const result=applySharedTime(workers,{start:'22:00',end:'02:00',pause:'30',overnight:true})
  for(const worker of result){
    assert.equal(worker.override,false)
    assert.equal(calculateTime(worker.start,worker.end,worker.pause,worker.overnight).paidMinutes,210)
  }
  assert.equal(result[1].name,'New')
  assert.equal(result[1].rate,'15')
})
