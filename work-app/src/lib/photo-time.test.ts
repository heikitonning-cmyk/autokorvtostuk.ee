import test from 'node:test'
import assert from 'node:assert/strict'
import {jpegCaptureTime,normalizeCaptureTime,photoTimeLabel} from './photo-time.ts'
function jpeg(little:boolean,date='2026:11:24 15:42:31') {
 const bytes=new Uint8Array(90),view=new DataView(bytes.buffer),base=12
 bytes.set([0xff,0xd8,0xff,0xe1,0,86,69,120,105,102,0,0])
 const u16=(p:number,v:number)=>view.setUint16(base+p,v,little)
 const u32=(p:number,v:number)=>view.setUint32(base+p,v,little)
 u16(0,0x4949);if(!little)u16(0,0x4d4d)
 u16(2,42);u32(4,8);u16(8,1);u16(10,0x8769);u16(12,4);u32(14,1);u32(18,26)
 u16(26,1);u16(28,0x9003);u16(30,2);u32(32,20);u32(36,44)
 bytes.set(new TextEncoder().encode(date+'\0'),base+44)
 return bytes.buffer
}
test('JPEG original timestamp survives either TIFF byte order',()=>{
 for(const little of [true,false])assert.equal(jpegCaptureTime(jpeg(little)),'2026-11-24T15:42:31')
})
test('missing, malformed and truncated EXIF returns unknown without throwing',()=>{
 assert.equal(jpegCaptureTime(new ArrayBuffer(0)),null)
 assert.equal(jpegCaptureTime(jpeg(true).slice(0,35)),null)
 const broken=jpeg(true);new DataView(broken).setUint32(30,0xffffffff,true)
 assert.equal(jpegCaptureTime(broken),null)
 assert.equal(jpegCaptureTime(jpeg(true,'2026:02:30 15:42:31')),null)
})
test('strict date validation does not turn modification time into capture time',()=>{
 assert.equal(normalizeCaptureTime('2024:02:29 23:59:59'),'2024-02-29T23:59:59')
 for(const value of [null,'2026-02-29T10:00:00','2026-11-24T25:00:00','2026-11-24T10:00:00Z','garbage'])assert.equal(normalizeCaptureTime(value),null)
})
test('camera wall time stays unchanged and uploads are explicitly distinguished',()=>{
 assert.equal(photoTimeLabel({captured_at:'2026-11-24T15:42:31'}),'Pildistatud 24.11.2026 kell 15:42 · kaamera aeg')
 assert.match(photoTimeLabel({created_at:'2026-11-24T13:42:00Z'}),/Üles laaditud .*15:42.*pildistamise aeg puudub/)
 assert.equal(photoTimeLabel({}),'Pildistamise aeg puudub')
})
