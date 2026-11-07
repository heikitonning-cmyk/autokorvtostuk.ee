import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const manager='10000000-0000-4000-8000-000000000001', operator='10000000-0000-4000-8000-000000000002'
const a='20000000-0000-4000-8000-000000000001', b='20000000-0000-4000-8000-000000000002'
const site='30000000-0000-4000-8000-000000000001'
test('atomic bulk payroll corrections in real PostgreSQL',async t=>{
  const db=new PGlite({extensions:{btree_gist}});t.after(()=>db.close())
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema extensions;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated;
    create table public.users(id uuid primary key,role text,active boolean default true);
    create table public.customer_sites(id uuid primary key,active boolean default true);
    insert into public.users values('${manager}','manager',true),('${operator}','operator',true);
    insert into public.customer_sites values('${site}',true); grant select,update on public.customer_sites to authenticated;`)
  const read=(file:string)=>readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8')
  const helpers=read('20260822205000_harden_helper_functions.sql')
  await db.exec(helpers.slice(0,helpers.indexOf('create or replace function private.audit_job_change')))
  await db.exec('begin;'+read('20261107052811_employee_time_wages.sql')+'commit;')
  for(const file of ['20261107061650_worker_first_payroll.sql','20261107063549_payroll_payments.sql','20261107170532_bulk_edit_payroll_entries.sql']) await db.exec(read(file))
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${manager}',false);
    insert into public.payroll_employees(id,name,hourly_rate_cents) values('${a}','A',1250),('${b}','B',1500);
    select public.save_payroll_entries(array['${a}','${b}']::uuid[],array['${site}']::uuid[],'2026-11-01',480,1020,false,30,'Keep note');`)
  const rows=async()=>(await db.query<any>('select *,work_date::text as work_date,updated_at::text as updated_at from public.payroll_entries order by employee_id,id')).rows
  const edit=(entries:any[],start:number|null=null,end:number|null=null,nextDay:boolean|null=null,lunch:number|null=null)=>db.query<any>('select public.bulk_edit_payroll_entries($1::jsonb,$2,$3,$4,$5)',[JSON.stringify(entries.map(e=>({id:e.id,updated_at:e.updated_at}))),start,end,nextDay,lunch])
  const check=async(name:string,fn:()=>Promise<void>)=>t.test(name,async()=>{await db.exec('begin');try{await fn()}finally{await db.exec('rollback')}})
  await check('two workers retain distinct historical rates and labels, with recalculated wages and balances',async()=>{
    const before=await rows()
    await db.exec(`update public.payroll_employees set hourly_rate_cents=9000,active=false;
      select public.save_payroll_payment(gen_random_uuid(),'${a}','2026-11-01',2000,'test');`)
    assert.equal((await edit(before,540,1080,false,60)).rows[0].bulk_edit_payroll_entries,2)
    const after=await rows()
    assert.deepEqual(after.map(e=>[e.work_date,e.start_minute,e.end_minute,e.paid_minutes,e.wage_cents,e.hourly_rate_cents,e.note]),[
      ['2026-11-01',540,1080,480,10000,1250,'Keep note'],['2026-11-01',540,1080,480,12000,1500,'Keep note']])
    assert.equal((await db.query('select * from public.payroll_entry_sites')).rows.length,2)
    const balance=(await db.query<any>('select * from public.payroll_balances() order by employee_id')).rows
    assert.deepEqual(balance.map(e=>[Number(e.earned_cents),Number(e.paid_cents),Number(e.balance_cents)]),[[10000,2000,8000],[12000,0,12000]])
  })
  await check('zero pause and old work dates are supported without changing unselected rows',async()=>{
    await db.exec(`update public.payroll_entries set work_date='2025-12-19' where employee_id='${a}';`)
    const before=await rows();await edit([before[0]],null,null,null,0)
    const after=await rows();assert.equal(after[0].work_date,'2025-12-19');assert.equal(after[0].paid_minutes,540)
    assert.deepEqual(after[1],before[1])
  })
  await check('overnight edits calculate both workers correctly',async()=>{
    await edit(await rows(),1320,360,true,30)
    assert.deepEqual((await rows()).map(e=>[e.next_day,e.paid_minutes]),[[true,450],[true,450]])
  })
  await check('overlap anywhere rolls back every selected change',async()=>{
    await db.exec(`select public.save_payroll_entries(array['${b}']::uuid[],'{}'::uuid[],'2026-11-01',1020,1140,false,0,'Later work');`)
    const before=await rows(),selected=before.filter(e=>e.end_minute===1020)
    await db.exec('savepoint attempt');await assert.rejects(edit(selected,null,1080,false),{code:'23P01'});await db.exec('rollback to attempt')
    assert.deepEqual(await rows(),before)
  })
  await check('stale or missing entries block the whole batch, including retries',async()=>{
    const before=await rows();await edit(before,null,null,null,0)
    const current=await rows();await db.exec('savepoint stale');await assert.rejects(edit(before,540),{code:'P0001'});await db.exec('rollback to stale')
    assert.deepEqual(await rows(),current)
    await db.exec('savepoint missing');await assert.rejects(edit([...current,{id:'40000000-0000-4000-8000-999999999999',updated_at:current[0].updated_at}],540),{code:'P0001'});await db.exec('rollback to missing')
    assert.deepEqual(await rows(),current)
  })
  await check('invalid duration and running entries never change any selected rows',async()=>{
    const before=await rows();await db.exec('savepoint duration');await assert.rejects(edit(before,null,null,null,540),{code:'P0002'});await db.exec('rollback to duration')
    assert.deepEqual(await rows(),before)
    await db.exec(`update public.payroll_entries set end_minute=null,break_minutes=0 where employee_id='${b}';`)
    const current=await rows();await db.exec('savepoint running');await assert.rejects(edit(current,500),{code:'P0001'});await db.exec('rollback to running')
    assert.deepEqual(await rows(),current)
  })
  await check('duplicate, empty, oversized and empty-patch selections are rejected',async()=>{
    const before=await rows()
    for(const selection of [[],[before[0],before[0]],Array(101).fill(before[0])]){
      await db.exec('savepoint invalid');await assert.rejects(edit(selection,540),{code:'23514'});await db.exec('rollback to invalid')
    }
    await db.exec('savepoint no_patch');await assert.rejects(edit(before),{code:'23514'});await db.exec('rollback to no_patch')
    assert.deepEqual(await rows(),before)
  })
  for(const role of ['operator','inactive manager','anonymous']) await check(`${role} cannot perform bulk corrections`,async()=>{
    const before=await rows()
    if(role==='operator') await db.exec(`select set_config('request.jwt.claim.sub','${operator}',true);`)
    if(role==='inactive manager') await db.exec(`reset role; update public.users set active=false where id='${manager}'; set role authenticated;`)
    if(role==='anonymous') await db.exec('reset role; set role anon;')
    await assert.rejects(edit(before,540),{code:'42501'})
  })
})
