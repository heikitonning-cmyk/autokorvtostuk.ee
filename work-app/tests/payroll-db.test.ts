import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

// Real PostgreSQL engine, isolated from the live Supabase database.
test('payroll migration enforces calculations, historical rates, overlaps and access', async t => {
  const db = new PGlite({ extensions: { btree_gist } })
  t.after(() => db.close())
  const manager = '10000000-0000-4000-8000-000000000001'
  const operator = '10000000-0000-4000-8000-000000000002'
  const employee = '20000000-0000-4000-8000-000000000001'
  const other = '20000000-0000-4000-8000-000000000002'
  const site = '30000000-0000-4000-8000-000000000001'
  const entry = '40000000-0000-4000-8000-000000000001'
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema extensions;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema auth, public to authenticated;
    create table public.users(id uuid primary key, role text, active boolean default true);
    create table public.customer_sites(id uuid primary key, active boolean default true);
    insert into public.users values ('${manager}','manager',true), ('${operator}','operator',true);
    insert into public.customer_sites values ('${site}',true);
    grant select on public.customer_sites to authenticated;
  `)
  // Reuse the app's actual role and timestamp helpers.
  const helpers = readFileSync(new URL('../supabase/migrations/20260822205000_harden_helper_functions.sql', import.meta.url),'utf8')
  await db.exec(helpers.slice(0,helpers.indexOf('create or replace function private.audit_job_change')))
  const sql = readFileSync(new URL('../supabase/migrations/20261107052811_employee_time_wages.sql', import.meta.url),'utf8')
  await db.exec(`begin; ${sql} commit;`)
  await db.exec(readFileSync(new URL('../supabase/migrations/20261107061650_worker_first_payroll.sql', import.meta.url),'utf8'))
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${manager}',false);`)
  await db.exec(`insert into public.payroll_employees(id,name,hourly_rate_cents) values ('${employee}','Tööline A',1250),('${other}','Tööline B',1500);`)
  const add = (id:string, date:string, start:number, end:number, lunch=0, nextDay=false, worker=employee) => db.query<{hourly_rate_cents:number;wage_cents:number}>(`insert into public.payroll_entries(id,employee_id,site_id,work_date,start_minute,end_minute,break_minutes,next_day) values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,[id,worker,site,date,start,end,lunch,nextDay])
  const saved = () => db.query<{paid_minutes:number;wage_cents:number;hourly_rate_cents:number}>(`select paid_minutes,wage_cents,hourly_rate_cents from public.payroll_entries where id=$1`,[entry])

  await t.test('insert snapshots current rate and calculates 8h30 at 12.50', async()=>{
    await add(entry,'2026-11-01',480,1020,30)
    assert.deepEqual((await saved()).rows[0],{paid_minutes:510,wage_cents:10625,hourly_rate_cents:1250})
  })
  await t.test('new rates apply only to new records; tampering with old rate has no effect',async()=>{
    await db.exec(`update public.payroll_employees set hourly_rate_cents=1800 where id='${employee}'; update public.payroll_entries set hourly_rate_cents=1,note='Muudetud' where id='${entry}';`)
    assert.equal((await saved()).rows[0].wage_cents,10625)
    const next=await add('40000000-0000-4000-8000-000000000002','2026-11-01',1020,1080)
    assert.equal(next.rows[0].hourly_rate_cents,1800)
    assert.equal(next.rows[0].wage_cents,1800)
  })
  await t.test('stale employee versions cannot restore an older rate',async()=>{
    const old = (await db.query<{updated_at:string}>(`select updated_at from public.payroll_employees where id=$1`,[employee])).rows[0].updated_at
    await db.query(`update public.payroll_employees set name='Tööline A uus' where id=$1`,[employee])
    const stale = await db.query(`update public.payroll_employees set hourly_rate_cents=1000 where id=$1 and updated_at=$2 returning id`,[employee,old])
    assert.equal(stale.rows.length,0)
    const current=(await db.query<{hourly_rate_cents:number}>(`select hourly_rate_cents from public.payroll_employees where id=$1`,[employee])).rows[0]
    assert.equal(current.hourly_rate_cents,1800)
  })
  await t.test('duplicates, overlaps and excessive lunch are rejected',async()=>{
    await assert.rejects(add('40000000-0000-4000-8000-000000000003','2026-11-01',600,660),{code:'23P01'})
    await assert.rejects(add('40000000-0000-4000-8000-000000000004','2026-11-02',480,540,60),{code:'23514'})
    await assert.rejects(add('40000000-0000-4000-8000-000000000005','2026-11-02',480,540,-1),{code:'23514'})
    await assert.rejects(add('40000000-0000-4000-8000-000000000006','2026-11-02',540,480),{code:'23514'})
    // Another worker can work at the same object at the same time.
    await add('40000000-0000-4000-8000-000000000007','2026-11-01',480,1020,30,false,other)
  })
  await t.test('overnight work rejects next-day overlap and allows adjacent shifts',async()=>{
    await add('40000000-0000-4000-8000-000000000008','2026-11-03',1320,360,30,true)
    await assert.rejects(add('40000000-0000-4000-8000-000000000009','2026-11-04',300,420),{code:'23P01'})
    await add('40000000-0000-4000-8000-000000000010','2026-11-04',360,420)
  })
  await t.test('changing worker uses their rate; archived workers retain history',async()=>{
    await db.exec(`update public.payroll_entries set employee_id='${other}' where id='40000000-0000-4000-8000-000000000002';`)
    const changed=await db.query<{hourly_rate_cents:number}>(`select hourly_rate_cents from public.payroll_entries where id='40000000-0000-4000-8000-000000000002'`)
    assert.equal(changed.rows[0].hourly_rate_cents,1500)
    await db.exec(`update public.payroll_employees set active=false where id='${employee}';`)
    assert.equal((await saved()).rows[0].wage_cents,10625)
    await assert.rejects(add('40000000-0000-4000-8000-000000000011','2026-11-05',480,540),{code:'23514'})
    await db.exec(`update public.payroll_entries set note='Ajalugu' where id='${entry}';`)
    await assert.rejects(db.exec(`delete from public.payroll_employees where id='${employee}'`),{code:'42501'})
  })
  await t.test('operators cannot read wages or mutate employees and entries',async()=>{
    await db.exec(`select set_config('request.jwt.claim.sub','${operator}',false);`)
    assert.equal((await db.query('select * from public.payroll_employees')).rows.length,0)
    assert.equal((await db.query('select * from public.payroll_entries')).rows.length,0)
    await assert.rejects(db.exec(`insert into public.payroll_employees(name,hourly_rate_cents) values ('Forbidden',1000)`),{code:'42501'})
    await assert.rejects(add('40000000-0000-4000-8000-000000000012','2026-11-06',480,540))
    assert.equal((await db.query(`update public.payroll_employees set hourly_rate_cents=1 returning id`)).rows.length,0)
    assert.equal((await db.query(`delete from public.payroll_entries returning id`)).rows.length,0)
  })
  await t.test('inactive managers and anonymous callers have no payroll access',async()=>{
    await db.exec(`reset role; update public.users set active=false where id='${manager}'; set role authenticated; select set_config('request.jwt.claim.sub','${manager}',false);`)
    assert.equal((await db.query('select * from public.payroll_entries')).rows.length,0)
    await db.exec('reset role; set role anon;')
    await assert.rejects(db.exec('select * from public.payroll_entries'),{code:'42501'})
    await assert.rejects(db.exec('select * from public.payroll_employees'),{code:'42501'})
  })
})
