import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const manager='10000000-0000-4000-8000-000000000001', operator='10000000-0000-4000-8000-000000000002'
const a='20000000-0000-4000-8000-000000000001', b='20000000-0000-4000-8000-000000000002'
const s1='30000000-0000-4000-8000-000000000001', s2='30000000-0000-4000-8000-000000000002'
test('worker-first payroll: real SQL batch entry, live timing and access',async t=>{
  const db=new PGlite({extensions:{btree_gist}})
  t.after(()=>db.close())
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema extensions;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated;
    create table public.users(id uuid primary key,role text,active boolean default true);
    create table public.customer_sites(id uuid primary key,active boolean default true);
    insert into public.users values('${manager}','manager',true),('${operator}','operator',true);
    insert into public.customer_sites values('${s1}',true),('${s2}',true);
    grant select,update on public.customer_sites to authenticated;`)
  const read=(name:string)=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8')
  const helpers=read('20260822205000_harden_helper_functions.sql')
  await db.exec(helpers.slice(0,helpers.indexOf('create or replace function private.audit_job_change')))
  await db.exec('begin;'+read('20261107052811_employee_time_wages.sql')+'commit;')
  await db.exec(`insert into public.payroll_employees(id,name,hourly_rate_cents) values('${a}','A',1250),('${b}','B',1500);
    insert into public.payroll_entries(employee_id,site_id,work_date,start_minute,end_minute) values('${a}','${s1}','2026-10-01',480,540);`)
  await db.exec(read('20261107061650_worker_first_payroll.sql'))
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${manager}',false);`)
  const save=(workers=[a,b],sites:string[]=[],mode='manual',date='2026-11-01',start=480,end=1020,lunch=30,id:string|null=null,version:string|null=null)=>db.query<{save_payroll_entries:number}>(
    'select public.save_payroll_entries($1::uuid[],$2::uuid[],$3::date,$4,$5,false,$6,\'test\',$7::uuid,$8::timestamptz,$9)',[workers,sites,date,start,end,lunch,id,version,mode])
  const entries=()=>db.query<any>('select *,work_date::text as work_date,updated_at::text as updated_at from public.payroll_entries order by employee_id')
  const finish=(rows:any[],lunch=0)=>db.query<{finish_payroll_entries:number}>('select public.finish_payroll_entries($1::jsonb,$2)',[JSON.stringify(rows.map(e=>({id:e.id,updated_at:e.updated_at}))),lunch])
  const rollback=async(name:string,fn:()=>Promise<void>)=>t.test(name,async()=>{await db.exec('begin');try{await fn()}finally{await db.exec('rollback')}})
  await t.test('existing single-site records are backfilled without changing wages',async()=>{
    assert.equal((await db.query('select * from public.payroll_entry_sites')).rows.length,1)
    assert.equal((await entries()).rows[0].wage_cents,1250)
    await db.exec('delete from public.payroll_entries')
  })
  await rollback('two workers without sites get independent rates and exact wages',async()=>{
    assert.equal((await save()).rows[0].save_payroll_entries,2)
    const rows=(await entries()).rows
    assert.deepEqual(rows.map(e=>[e.paid_minutes,e.wage_cents,e.site_id]),[[510,10625,null],[510,12750,null]])
  })
  await rollback('multiple labels do not duplicate hours or wages; removing all labels works',async()=>{
    await save([a],[s1,s2])
    const old=(await entries()).rows[0]
    assert.equal((await db.query('select * from public.payroll_entry_sites')).rows.length,2)
    assert.equal((await entries()).rows.length,1)
    await save([a],[],'manual','2026-11-01',480,1020,30,old.id,old.updated_at)
    assert.equal((await db.query('select * from public.payroll_entry_sites')).rows.length,0)
    assert.equal((await entries()).rows[0].wage_cents,10625)
  })
  await rollback('batch overlap rolls back workers inserted before the failure',async()=>{
    await save([b])
    await db.exec('savepoint overlap')
    await assert.rejects(save(),{code:'23P01'})
    await db.exec('rollback to overlap')
    assert.deepEqual((await entries()).rows.map(e=>e.employee_id),[b])
  })
  await rollback('duplicate employee selections save only once',async()=>{
    assert.equal((await save([a,a])).rows[0].save_payroll_entries,1)
    assert.equal((await entries()).rows.length,1)
  })
  await rollback('running records persist with no paid total and keep initial rates',async()=>{
    await save([a,b],[s1,s2],'start')
    const rows=(await entries()).rows
    assert.equal(rows.length,2)
    assert.deepEqual(rows.map(e=>[e.end_minute,e.paid_minutes,e.wage_cents]),[[null,null,null],[null,null,null]])
    const now=(await db.query<any>(`select (statement_timestamp() at time zone 'Europe/Tallinn')::date::text as date,
      extract(hour from statement_timestamp() at time zone 'Europe/Tallinn')::int*60+extract(minute from statement_timestamp() at time zone 'Europe/Tallinn')::int as minute`)).rows[0]
    assert.equal(rows[0].work_date,now.date)
    assert.equal(rows[0].start_minute,now.minute)
    assert.equal(rows[0].start_minute,rows[1].start_minute)
    await db.exec(`update public.payroll_employees set hourly_rate_cents=5000;`)
    await db.exec(`update public.payroll_entries set work_date=(date_trunc('minute',statement_timestamp() at time zone 'Europe/Tallinn')-interval '2 hours')::date,
      start_minute=extract(hour from statement_timestamp() at time zone 'Europe/Tallinn'-interval '2 hours')::int*60+extract(minute from statement_timestamp() at time zone 'Europe/Tallinn'-interval '2 hours')::int;`)
    const refreshed=(await entries()).rows
    assert.equal((await finish(refreshed,30)).rows[0].finish_payroll_entries,2)
    assert.deepEqual((await entries()).rows.map(e=>[e.paid_minutes,e.wage_cents]),[[90,1875],[90,2250]])
    assert.equal((await db.query('select * from public.payroll_entry_sites')).rows.length,4)
    await db.exec('savepoint retry_finish')
    await assert.rejects(finish(refreshed,30),{code:'P0001'})
    await db.exec('rollback to retry_finish')
    assert.equal((await entries()).rows.length,2)
  })
  await rollback('duplicate start cannot create another open record',async()=>{
    await save([a],[],'start')
    await assert.rejects(save([a],[],'start'),e=>['23505','23P01'].includes((e as any).code))
  })
  await rollback('manual entry overlapping a live timer is blocked',async()=>{
    await save([a],[],'start')
    const row=(await entries()).rows[0]
    const date=(await db.query<any>(`select ($1::date+1)::text as date`,[row.work_date])).rows[0].date
    await assert.rejects(save([a],[],'manual',date),{code:'23P01'})
  })
  await rollback('a timer under one minute cannot add phantom paid time',async()=>{
    await save([a],[],'start')
    await assert.rejects(finish((await entries()).rows),{code:'P0002'})
  })
  await rollback('stale versions prevent a second finish or overwrite',async()=>{
    await save([a],[],'start')
    const row=(await entries()).rows[0]
    await db.exec(`update public.payroll_entries set note='changed';`)
    await assert.rejects(finish([row]),{code:'P0001'})
  })
  await rollback('batch finish rolls back the first worker if a later version changed',async()=>{
    await save([a,b],[],'start')
    await db.exec('update public.payroll_entries set work_date=work_date-1')
    const rows=(await entries()).rows
    await db.query("update public.payroll_entries set note='newer' where employee_id=$1",[b])
    await db.exec('savepoint finish_batch')
    await assert.rejects(finish(rows),{code:'P0001'})
    await db.exec('rollback to finish_batch')
    assert.deepEqual((await entries()).rows.map(e=>e.end_minute),[null,null])
  })
  await rollback('forgotten timers require correction after 24 hours',async()=>{
    await save([a],[],'start')
    await db.exec('update public.payroll_entries set work_date=work_date-2')
    await assert.rejects(finish((await entries()).rows),{code:'P0002'})
  })
  await rollback('an archived worker can be stopped and history keeps its rate',async()=>{
    await save([a],[],'start')
    await db.exec(`update public.payroll_entries set work_date=work_date-1;
      update public.payroll_employees set active=false where id='${a}';`)
    await finish((await entries()).rows)
    assert.equal((await entries()).rows[0].paid_minutes,1440)
  })
  await rollback('a selected archived site can be retained while editing history',async()=>{
    await save([a],[s1,s2])
    const old=(await entries()).rows[0]
    await db.exec(`reset role; update public.customer_sites set active=false where id='${s2}'; set role authenticated;`)
    await save([a],[s1,s2],'manual','2026-11-01',480,1020,30,old.id,old.updated_at)
    assert.equal((await db.query('select * from public.payroll_entry_sites')).rows.length,2)
  })
  await rollback('operators cannot call batch functions or see site associations',async()=>{
    await save([a],[s1])
    await db.exec(`select set_config('request.jwt.claim.sub','${operator}',true);`)
    assert.equal((await db.query('select * from public.payroll_entry_sites')).rows.length,0)
    await assert.rejects(save(),{code:'42501'})
  })
  await rollback('anonymous callers cannot run payroll functions',async()=>{
    await db.exec('reset role; set role anon;')
    await assert.rejects(save(),{code:'42501'})
  })
})
