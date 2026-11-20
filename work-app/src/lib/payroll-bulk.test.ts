import test from 'node:test'
import assert from 'node:assert/strict'
import { parseBulkEntries, parseBulkPatch, previewBulkEntry } from './payroll-bulk.ts'
import type { TimeEntry } from './payroll.ts'

const entry: TimeEntry = {id:'40000000-0000-4000-8000-000000000001',employee_id:'20000000-0000-4000-8000-000000000001',site_id:null,work_date:'2026-11-01',start_minute:480,end_minute:1020,next_day:false,break_minutes:30,hourly_rate_cents:1250,paid_minutes:510,wage_cents:10625,note:'',updated_at:'2026-11-01T12:00:00Z'}
const form = (values:Record<string,string>) => {const f=new FormData();Object.entries(values).forEach(([k,v])=>f.set(k,v));return f}

test('bulk correction changes only enabled fields and allows a zero break',()=>{
  const patch=parseBulkPatch(form({changeBreak:'on',lunch:'0',start:'00:00',end:'00:00',nextDay:'on'}))
  assert.deepEqual(patch,{startMinute:null,endMinute:null,nextDay:null,breakMinutes:0})
  assert.deepEqual(previewBulkEntry(entry,patch),{startMinute:480,endMinute:1020,breakMinutes:0,paidMinutes:540,nextDay:false,wageCents:11250})
})
test('one new end time uses each original start, break and rate',()=>{
  const patch=parseBulkPatch(form({changeEnd:'on',end:'18:00'}))
  assert.equal(previewBulkEntry(entry,patch).wageCents,11875)
  assert.equal(previewBulkEntry({...entry,start_minute:540,break_minutes:60,hourly_rate_cents:1500},patch).wageCents,12000)
})
test('overnight choice is explicit and invalid per-worker durations are blocked',()=>{
  const patch=parseBulkPatch(form({changeStart:'on',start:'22:00',changeEnd:'on',end:'06:00',nextDay:'on'}))
  assert.equal(previewBulkEntry(entry,patch).paidMinutes,450)
  assert.throws(()=>previewBulkEntry(entry,{...patch,nextDay:false}))
  assert.throws(()=>previewBulkEntry({...entry,end_minute:null},patch))
})
test('bulk patch rejects no fields, invalid clocks and empty or excessive breaks',()=>{
  const cases:Record<string,string>[]=[{}, {changeStart:'on',start:'24:00'}, {changeBreak:'on',lunch:''}, {changeBreak:'on',lunch:'1440'}, {changeBreak:'on',lunch:'-1'}]
  for(const values of cases) assert.throws(()=>parseBulkPatch(form(values)))
})
test('selection requires unique IDs, valid versions and at most 100 entries',()=>{
  assert.deepEqual(parseBulkEntries(JSON.stringify([entry])),[{id:entry.id,updated_at:entry.updated_at}])
  for(const value of [[],[entry,entry],[{...entry,updated_at:'bad'}],[null],[{...entry,id:'bad'}],Array(101).fill(entry),{}]) assert.throws(()=>parseBulkEntries(JSON.stringify(value)))
  assert.throws(()=>parseBulkEntries('bad json'))
})
