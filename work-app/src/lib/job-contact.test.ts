import test from 'node:test'
import assert from 'node:assert/strict'
import { phoneHref, jobPhoneHref } from './job-contact.ts'

test('phone links normalize punctuation and preserve explicit country codes',()=>{
  assert.equal(phoneHref(' +372 5556-7630 '),'tel:+37255567630')
  assert.equal(phoneHref('00372 (5556) 7630'),'tel:+37255567630')
  assert.equal(phoneHref('55567630'),'tel:55567630')
  for(const value of [null,undefined,'','—','javascript:alert(1)','tel:+37255567630','+12+34','12']) assert.equal(phoneHref(value),null)
})
test('call uses booking contact with customer fallback',()=>{
  assert.equal(jobPhoneHref({website_booking_details:{phone:'+372 1234567'},customer:{phone:'7654321'}}),'tel:+3721234567')
  assert.equal(jobPhoneHref({website_booking_details:{phone:''},customer:{phone:'7654321'}}),'tel:7654321')
  assert.equal(jobPhoneHref({}),null)
})
