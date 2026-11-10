import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const manager='10000000-0000-4000-8000-000000000001', operator='10000000-0000-4000-8000-000000000002'
const a='20000000-0000-4000-8000-000000000001', b='20000000-0000-4000-8000-000000000002'
const customer='30000000-0000-4000-8000-000000000001',site='30000000-0000-4000-8000-000000000002'
test('compact dispatch and separate driver payroll use atomic, authorized database writes',async t=>{
  const db=new PGlite({extensions:{btree_gist}});t.after(()=>db.close())
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema extensions;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to authenticated;
    create table public.users(id uuid primary key,role text,active boolean default true);
    create table public.customers(id uuid primary key);
    create table public.customer_sites(id uuid primary key,customer_id uuid references public.customers(id),name text default 'Neste site',active boolean default true);
    create table public.jobs(id uuid primary key,operator_id uuid references public.users(id),customer_id uuid references public.customers(id),site_id uuid references public.customer_sites(id),
      address text,object_name text,description text,planned_date date,planned_time time,planned_end_time time,start_planned timestamptz,end_planned timestamptz,
      status text default 'uus',created_by uuid,created_at timestamptz default now(),updated_at timestamptz default now(),estimated_total numeric,source text,website_booking_details jsonb);
    insert into public.users values('${manager}','manager',true),('${operator}','operator',true);
    insert into public.customers values('${customer}');insert into public.customer_sites (id,customer_id,active) values('${site}','${customer}',true);
    grant select on public.users,public.customers,public.customer_sites to authenticated;
    grant select,insert,update,delete on public.jobs to authenticated;`)
  const read=(file:string)=>readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8')
  const helpers=read('20260822205000_harden_helper_functions.sql')
  await db.exec(helpers.slice(0,helpers.indexOf('create or replace function private.audit_job_change')))
  await db.exec(`create trigger jobs_updated_at before update on public.jobs for each row execute function private.set_updated_at();
    alter table public.jobs enable row level security;
    create policy manager on public.jobs for all to authenticated using(private.is_manager()) with check(private.is_manager());
    create policy shared_read on public.jobs for select to authenticated using(true);
    create policy legacy_update on public.jobs for update to authenticated using(operator_id=auth.uid()) with check(operator_id=auth.uid());`)
  await db.exec('begin;'+read('20261107052811_employee_time_wages.sql')+'commit;')
  for(const file of ['20261107061650_worker_first_payroll.sql','20261107063549_payroll_payments.sql','20261110095155_simple_dispatch.sql']) await db.exec(read(file))
  const login=async(id:string)=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`)
  await login(manager)
  await db.exec(`insert into public.payroll_employees(id,name,hourly_rate_cents) values('${a}','Payroll driver',1200),('${b}','Other driver',1500);`)
  const payload={address:'Test 1, Tallinn',planned_date:'2026-11-10',planned_time:'10:00',contact_phone:'+372 5551234',driver_employee_id:a,site_id:'',customer_id:'',description:'Rennide puhastus'}
  const time=(date:string)=>({work_date:date,start_minute:480,end_minute:720,next_day:false,break_minutes:30})
  const save=(id:string,job:any=payload,payroll:any=null,version:string|null=null,entryVersion:string|null=null)=>db.query('select public.save_simple_job($1,$2,$3::jsonb,$4::jsonb,$5)',[id,version,JSON.stringify(job),payroll?JSON.stringify(payroll):null,entryVersion])
  const job=async(id:string)=>(await db.query<any>('select *,updated_at::text updated_at from public.jobs where id=$1',[id])).rows[0]
  const entry=async(id:string)=>(await db.query<any>('select *,updated_at::text updated_at from public.payroll_entries where job_id=$1',[id])).rows[0]

  await t.test('schedule alone never creates wages and driver need not have a login',async()=>{
    const id=randomUUID();await save(id)
    const saved=await job(id)
    assert.equal(saved.driver_name,'Payroll driver');assert.equal(saved.operator_id,null);assert.equal(saved.status,'kinnitatud')
    assert.equal(new Date(saved.start_planned).toISOString(),'2026-11-10T08:00:00.000Z')
    assert.equal(await entry(id),undefined)
  })
  await t.test('departure is independent; exact retries do not duplicate or overwrite; balance uses paid minutes',async()=>{
    const id=randomUUID(),hours=time('2026-11-10');await save(id,payload,hours)
    const first=await job(id),wages=await entry(id)
    assert.equal(wages.paid_minutes,210);assert.equal(wages.wage_cents,4200)
    await save(id,payload,hours);assert.deepEqual(await entry(id),wages)
    await save(id,{...payload,address:'Changed'},null,first.updated_at)
    await save(id,payload,hours);assert.equal((await job(id)).address,'Changed')
    await db.query('select public.save_payroll_payment($1,$2,$3,$4,$5)',[randomUUID(),a,'2026-11-10',1000,'Paid'])
    const balances=(await db.query<any>('select * from public.payroll_balances() where employee_id=$1',[a])).rows[0]
    assert.equal(Number(balances.balance_cents),3200)
  })
  await t.test('overlap rolls back job creation and also existing job edits',async()=>{
    const id=randomUUID();await assert.rejects(save(id,payload,time('2026-11-10')),{code:'23P01'});assert.equal(await job(id),undefined)
    await save(id);const before=await job(id)
    await assert.rejects(save(id,{...payload,address:'Must roll back'},time('2026-11-10'),before.updated_at),{code:'23P01'})
    assert.deepEqual(await job(id),before)
  })
  await t.test('edits retain historical rate and all pricing/source metadata; stale versions fail',async()=>{
    const id=randomUUID();await save(id,payload,time('2026-11-11'))
    await db.query("update public.jobs set estimated_total=345,source='website',website_booking_details=$2 where id=$1",[id,JSON.stringify({phone:'12345'})])
    const before=await job(id),wages=await entry(id)
    await db.query('update public.payroll_employees set hourly_rate_cents=9000 where id=$1',[a])
    await save(id,{...payload,planned_time:'11:00'},{...time('2026-11-11'),end_minute:780},before.updated_at,wages.updated_at)
    const after=await job(id),paid=await entry(id)
    assert.equal(paid.hourly_rate_cents,1200);assert.equal(paid.wage_cents,5400)
    assert.equal(after.estimated_total,'345');assert.equal(after.source,'website');assert.deepEqual(after.website_booking_details,{phone:'12345'})
    await assert.rejects(save(id,payload,null,before.updated_at),{code:'P0001'})
    await assert.rejects(save(id,payload,time('2026-11-11'),after.updated_at,wages.updated_at),{code:'P0001'})
  })
  await t.test('driver change requires explicit wage correction; job deletion retains wages',async()=>{
    const id=randomUUID();await save(id,payload,time('2026-11-12'));const before=await job(id),wages=await entry(id)
    await assert.rejects(save(id,{...payload,driver_employee_id:b},null,before.updated_at),{code:'23514'})
    await save(id,{...payload,driver_employee_id:b},time('2026-11-12'),before.updated_at,wages.updated_at)
    assert.equal((await entry(id)).hourly_rate_cents,1500)
    await db.query('delete from public.jobs where id=$1',[id])
    assert.equal((await db.query<any>('select job_id from public.payroll_entries where id=$1',[wages.id])).rows[0].job_id,null)
  })
  await t.test('overnight work, site ownership, archived employee and duration checks',async()=>{
    const id=randomUUID();await save(id,{...payload,site_id:site},{...time('2026-11-13'),start_minute:1320,end_minute:360,next_day:true})
    assert.equal((await entry(id)).paid_minutes,450);assert.equal((await job(id)).customer_id,customer)
    await assert.rejects(save(randomUUID(),payload,{...time('2026-11-14'),break_minutes:240}),{code:'23514'})
    await assert.rejects(save(randomUUID(),payload,{...time('2026-11-14'),end_minute:null}),{code:'23514'})
    await db.query('update public.payroll_employees set active=false where id=$1',[a])
    await assert.rejects(save(randomUUID()),{code:'23514'})
    await save(id,payload,{...time('2026-11-13'),start_minute:1320,end_minute:420,next_day:true},(await job(id)).updated_at,(await entry(id)).updated_at)
  })
  await t.test('operator and anonymous cannot mutate driver or payroll data',async()=>{
    await login(manager);const id=randomUUID();await save(id,{...payload,driver_employee_id:b})
    await db.query('update public.jobs set operator_id=$2 where id=$1',[id,operator])
    await login(operator)
    await assert.rejects(save(randomUUID()),{code:'42501'})
    await assert.rejects(db.query('update public.jobs set driver_employee_id=null where id=$1',[id]),{code:'42501'})
    assert.equal((await db.query('select * from public.payroll_entries')).rows.length,0)
    assert.equal((await db.query('select * from public.payroll_employees')).rows.length,0)
    await db.exec('reset role;set role anon')
    await assert.rejects(save(randomUUID()),{code:'42501'})
    await db.exec(`reset role;update public.users set active=false where id='${manager}'`)
    await login(manager);await assert.rejects(save(randomUUID()),{code:'42501'})
  })
})
