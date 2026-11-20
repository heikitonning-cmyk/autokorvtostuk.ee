import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {contentHash,archivePath,eligible,verifyCopy} from '../../supabase/functions/photo-archive/core.ts'
test('Dropbox hash matches independent block construction including empty and multi-block input',async()=>{
 for(const size of [0,1,4194304,4194305]){
  const bytes=new Uint8Array(size).fill(17)
  const hashes=[];for(let i=0;i<size;i+=4194304)hashes.push(createHash('sha256').update(bytes.slice(i,i+4194304)).digest())
  assert.equal(await contentHash(bytes),createHash('sha256').update(Buffer.concat(hashes)).digest('hex'))
 }
})
test('only jobs older than 30 days, completed or day-managed, are automatic candidates',()=>{
 const base={planned_date:'2026-10-18',dispatch_managed:true,status:'uus'}
 assert.equal(eligible(base,'2026-11-19'),true)
 assert.equal(eligible({...base,planned_date:'2026-10-20'},'2026-11-19'),false)
 assert.equal(eligible({...base,planned_date:'2026-11-20'},'2026-11-19'),false)
 assert.equal(eligible({...base,status:'tuhistatud'},'2026-11-19'),false)
 assert.equal(eligible({...base,status:'toob'},'2026-11-19'),false)
 assert.equal(eligible({...base,status:'teel'},'2026-11-19'),false)
 assert.equal(eligible({...base,dispatch_managed:false},'2026-11-19'),false)
 assert.equal(eligible({...base,completed_at:'2026-11-18T12:00:00Z'},'2026-11-19'),false)
 assert.equal(eligible({...base,status:'completed',dispatch_managed:false},'2026-11-19'),true)
})
test('paths are deterministic, safe and distinguish photos and jobs',()=>{
 const p={id:'photo-a',storage_path:'job/a.jpg'},j={id:'job-a',address:'Tee / 1: Tallinn',planned_date:'2026-10-18'}
 assert.equal(archivePath(p,j),archivePath(p,j))
 assert.ok(archivePath(p,j).includes('Tee - 1- Tallinn'))
 assert.notEqual(archivePath(p,j),archivePath({...p,id:'photo-b'},j))
})
test('source cannot be released when hash or length differs',()=>{
 assert.doesNotThrow(()=>verifyCopy({size:3,content_hash:'abc'},3,'abc'))
 assert.throws(()=>verifyCopy({size:2,content_hash:'abc'},3,'abc'))
 assert.throws(()=>verifyCopy({size:3,content_hash:'different'},3,'abc'))
})
