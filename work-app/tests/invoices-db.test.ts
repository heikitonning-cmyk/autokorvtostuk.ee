import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {dayFixture} from './day-fixture.ts'

test('invoice tracking lifecycle, independence, history, retention and access',async t=>{
 const {db,login,manager,operator}=await dayFixture();t.after(()=>db.close())
 const legacy=randomUUID(),job=randomUUID()
 await db.query("insert into public.jobs(id,status,estimated_total) values($1,'completed',90)",[legacy])
 await db.exec('reset role')
 await db.exec(readFileSync(new URL('../supabase/migrations/20261119062940_job_invoice_tracking.sql',import.meta.url),'utf8'))
 await login(manager)
 const read=async(id=job)=>(await db.query<any>('select *,issued_on::text issued_on,due_on::text due_on,paid_on::text paid_on from public.job_invoices where job_id=$1',[id])).rows[0]
 const save=async(p:any={})=>{const i=await read();return (await db.query<any>('select public.save_job_invoice($1,$2,$3,$4,$5,$6,$7,$8,$9) as invoice',
 [job,p.version??i.version,p.status??i.status,p.amount??i.amount_cents,p.override??i.amount_override,p.number??i.invoice_number,p.issued??i.issued_on,p.due??i.due_on,p.paid??null])).rows[0].invoice}
 await t.test('legacy work is opt in; active jobs do not create invoices',async()=>{
   assert.equal(await read(legacy),undefined)
   await db.query('select public.activate_job_invoice($1)',[legacy])
   assert.equal((await read(legacy)).status,'draft')
   await db.query("insert into public.jobs(id,status,estimated_total) values($1,'uus',88)",[job])
   assert.equal(await read(),undefined)
 })
 await t.test('completion snapshots the existing price once',async()=>{
   await db.query("update public.jobs set status='completed' where id=$1",[job])
   assert.equal(Number((await read()).amount_cents),8800)
   await db.query('select public.activate_job_invoice($1)',[job])
   await db.query("update public.jobs set status='tehtud' where id=$1",[job])
   assert.equal((await db.query<any>('select count(*)::int n from public.job_invoices where job_id=$1',[job])).rows[0].n,1)
 })
 await t.test('draft follows job pricing, issued amount freezes',async()=>{
   await db.query('update public.jobs set estimated_total=90 where id=$1',[job]);assert.equal(Number((await read()).amount_cents),9000)
   const i=await save({status:'unpaid',issued:'2026-11-19'})
   assert.equal(i.due_on,'2026-11-26')
   await db.query('update public.jobs set estimated_total=100 where id=$1',[job]);assert.equal(Number((await read()).amount_cents),9000)
 })
 await t.test('due date, paid archive and reopening persist across sessions',async()=>{
   await save({due:'2026-11-22',number:'EK-123'});assert.equal((await read()).due_on,'2026-11-22')
   await save({status:'paid',paid:'2026-11-20'});await login(manager)
   assert.equal((await read()).status,'paid');assert.equal((await read()).paid_on,'2026-11-20')
   await save({status:'unpaid'});assert.equal((await read()).paid_on,null)
 })
 await t.test('invoice override does not change job or payroll and is audited',async()=>{
   const before=(await db.query('select * from public.payroll_entries')).rows
   await save({amount:12345,override:true})
   assert.equal(Number((await read()).amount_cents),12345)
   assert.equal(Number((await db.query<any>('select estimated_total from public.jobs where id=$1',[job])).rows[0].estimated_total),100)
   assert.deepEqual((await db.query('select * from public.payroll_entries')).rows,before)
   const history=(await db.query<any>('select * from public.job_invoice_history where job_id=$1 order by id desc',[job])).rows[0]
   assert.equal(history.changed_by,manager);assert.equal(history.new_data.amount_cents,12345);assert.ok(history.previous_data)
 })
 await t.test('stale updates fail, repeated requests are harmless, invalid dates fail',async()=>{
   await assert.rejects(save({version:1,amount:13000}),{code:'P0001'})
   const i=await read();await save({version:1});assert.equal((await read()).version,i.version)
   await assert.rejects(save({due:'2026-11-18'}),{code:'23514'})
 })
 await t.test('records and their source job cannot be deleted by a manager',async()=>{
   await assert.rejects(db.query('delete from public.job_invoices where job_id=$1',[job]),{code:'42501'})
   await assert.rejects(db.query('delete from public.jobs where id=$1',[job]),{code:'23001'})
 })
 await t.test('operator and anonymous cannot read or modify tracking',async()=>{
   await login(operator)
   assert.deepEqual((await db.query('select * from public.job_invoices')).rows,[])
   assert.deepEqual((await db.query('select * from public.job_invoice_history')).rows,[])
   await assert.rejects(db.query('select public.activate_job_invoice($1)',[job]),{code:'42501'})
   await assert.rejects(db.query("select public.save_job_invoice($1,1,'paid',1,true,null,null,null,null)",[job]),{code:'42501'})
   await db.exec('reset role;set role anon')
   await assert.rejects(db.query('select * from public.job_invoices'),{code:'42501'})
 })
})
