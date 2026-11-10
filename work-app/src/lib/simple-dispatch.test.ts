import test from 'node:test'
import assert from 'node:assert/strict'
import { driverTimePreview, visibleDispatchSites, minuteTime, plannedEndError } from './simple-dispatch.ts'
import { jobPhoneHref } from './job-contact.ts'

test('Neste stays hidden until explicitly enabled, including when searching',()=>{
  const sites=[{id:'1',customer_id:'a',name:'Neste Keila',address:'Tallinna 1',source:'neste_import'},
    {id:'2',customer_id:'b',name:'Maja',address:'Tartu 2'}]
  assert.deepEqual(visibleDispatchSites(sites,false,'').map(s=>s.id),['2'])
  assert.equal(visibleDispatchSites(sites,false,'neste').length,0)
  assert.deepEqual(visibleDispatchSites(sites,true,' KEILA ').map(s=>s.id),['1'])
})
test('paid time preview uses departure, overnight flag and unpaid break',()=>{
  assert.deepEqual(driverTimePreview('07:30','16:00',false,'30',1200),{minutes:480,cents:9600})
  assert.deepEqual(driverTimePreview('22:00','06:00',true,'30',1500),{minutes:450,cents:11250})
  for(const args of [['08:00','07:00',false,'0'],['24:00','09:00',false,'0'],['08:00','09:00',false,'60']] as const)
    assert.equal(driverTimePreview(args[0],args[1],args[2],args[3],1200),null)
  assert.equal(minuteTime(450),'07:30');assert.equal(minuteTime(null),'')
})
test('explicit job contact takes precedence over booking and customer contacts',()=>{
  assert.equal(jobPhoneHref({contact_phone:'+372 555 1234',website_booking_details:{phone:'1234567'},customer:{phone:'7654321'}}),'tel:+3725551234')
})

test('appointment end is optional but must follow a dated start',()=>{
  assert.equal(plannedEndError('', '', ''), null)
  assert.equal(plannedEndError('2026-11-11', '10:00', '12:00'), null)
  for (const [date, start, end] of [['','10:00','12:00'],['2026-11-11','','12:00'],['2026-11-11','10:00','09:00'],['2026-11-11','10:00','10:00'],['2026-11-11','10:00','24:00']])
    assert.ok(plannedEndError(date, start, end))
})
