import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const manager='10000000-0000-4000-8000-000000000001',operator='10000000-0000-4000-8000-000000000002'
const a='20000000-0000-4000-8000-000000000001',b='20000000-0000-4000-8000-000000000002'
test('payroll payments ledger uses real SQL for balances, retries and access',async t=>{
  const db=new PGlite({extensions:{btree_gist}})
  t.after(()=>db.close())
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema extensions;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated;
    create table public.users(id uuid primary key,role text,active boolean default true);
    create table public.customer_sites(id uuid primary key,active boolean default true);
    insert into public.users values('${manager}','manager',true),('${operator}','operator',true);
    grant select,update on public.customer_sites to authenticated;`)
  const read=(name:string)=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8')
  const helpers=read('20260822205000_harden_helper_functions.sql')
  await db.exec(helpers.slice(0,helpers.indexOf('create or replace function private.audit_job_change')))
  for(const file of ['20261107052811_employee_time_wages.sql','20261107061650_worker_first_payroll.sql','20261107063549_payroll_payments.sql']) await db.exec('begin;'+read(file)+'commit;')
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${manager}',false);
    insert into public.payroll_employees(id,name,hourly_rate_cents) values('${a}','A',1200),('${b}','B',1500);
    insert into public.payroll_entries(employee_id,work_date,start_minute,end_minute) values
      ('${a}','2026-10-01',480,1080),('${a}','2026-10-02',480,1080),('${b}','2026-11-01',480,1080);
    insert into public.payroll_entries(employee_id,work_date,start_minute,end_minute) values('${a}','2026-11-07',480,null);`)
  const pay=(id:string,amount:number,worker=a,date='2026-11-01',version:string|null=null,note='test')=>db.query(
    'select public.save_payroll_payment($1::uuid,$2::uuid,$3::date,$4,$5,$6::timestamptz)',[id,worker,date,amount,note,version])
  const balance=async(worker=a)=>{
    const row=(await db.query<any>('select * from public.payroll_balances() where employee_id=$1',[worker])).rows[0]
    return row?{earned:Number(row.earned_cents),paid:Number(row.paid_cents),due:Number(row.balance_cents)}:undefined
  }
  const payment=async(id:string)=>(await db.query<any>('select *,updated_at::text as version from public.payroll_payments where id=$1',[id])).rows[0]
  const rollback=async(name:string,fn:()=>Promise<void>)=>t.test(name,async()=>{await db.exec('begin');try{await fn()}finally{await db.exec('rollback')}})
  await rollback('November payment reduces October wages and ignores running time',async()=>{
    await pay(randomUUID(),10000)
    assert.deepEqual(await balance(),{earned:24000,paid:10000,due:14000})
  })
  await rollback('multiple payments and wages do not multiply each other',async()=>{
    await pay(randomUUID(),5000);await pay(randomUUID(),7000)
    assert.deepEqual(await balance(),{earned:24000,paid:12000,due:12000})
  })
  await rollback('overpayment is an advance; another employee retains their full balance',async()=>{
    await pay(randomUUID(),25000)
    assert.deepEqual(await balance(),{earned:24000,paid:25000,due:-1000})
    assert.deepEqual(await balance(b),{earned:15000,paid:0,due:15000})
  })
  await rollback('a repeated request with the same ID records only one payment',async()=>{
    const id=randomUUID();await pay(id,5000);await pay(id,5000)
    assert.equal((await db.query('select * from public.payroll_payments')).rows.length,1)
    assert.equal((await balance())?.due,19000)
    await assert.rejects(pay(id,6000),{code:'P0001'})
  })
  await rollback('separate same-day payments with equal amounts remain possible',async()=>{
    await pay(randomUUID(),5000);await pay(randomUUID(),5000)
    assert.equal((await balance())?.paid,10000)
  })
  await rollback('payment edits use versions and adjust the employee and month correctly',async()=>{
    const id=randomUUID();await pay(id,5000)
    const before=await payment(id)
    await pay(id,6000,b,'2026-10-30',before.version)
    assert.equal((await balance())?.due,24000)
    assert.equal((await balance(b))?.due,9000)
    await assert.rejects(pay(id,7000,b,'2026-10-30',before.version),{code:'P0001'})
  })
  await rollback('cancellation restores due amount while retaining original payment history',async()=>{
    const id=randomUUID();await pay(id,5000)
    const before=await payment(id)
    await db.query("update public.payroll_payments set voided_at=now(),amount_cents=999,employee_id=$1 where id=$2 and updated_at=$3",[b,id,before.version])
    const cancelled=await payment(id)
    assert.ok(cancelled.voided_at)
    assert.equal(cancelled.amount_cents,5000)
    assert.equal(cancelled.employee_id,a)
    assert.equal((await balance())?.due,24000)
    await assert.rejects(pay(id,5000),{code:'P0001'})
  })
  await rollback('stale cancellation cannot remove an edited payment',async()=>{
    const id=randomUUID();await pay(id,5000)
    const before=await payment(id);await pay(id,6000,a,'2026-11-01',before.version)
    const result=await db.query('update public.payroll_payments set voided_at=now() where id=$1 and updated_at=$2 returning id',[id,before.version])
    assert.equal(result.rows.length,0)
    assert.equal((await balance())?.paid,6000)
  })
  await rollback('archived workers can receive outstanding pay',async()=>{
    await db.exec(`update public.payroll_employees set active=false where id='${a}'`)
    await pay(randomUUID(),24000)
    assert.equal((await balance())?.due,0)
  })
  for(const amount of [0,-100,100000000]) await rollback(`invalid amount ${amount} is rejected`,async()=>{
    await assert.rejects(pay(randomUUID(),amount),{code:'23514'})
  })
  await rollback('future payment dates are rejected',async()=>{
    await assert.rejects(pay(randomUUID(),100,a,'2099-12-31'),{code:'23514'})
  })
  await rollback('operators cannot see balances or payments or record a payment',async()=>{
    await pay(randomUUID(),100)
    await db.exec(`select set_config('request.jwt.claim.sub','${operator}',true)`)
    assert.equal((await db.query('select * from public.payroll_payments')).rows.length,0)
    assert.equal((await db.query('select * from public.payroll_balances()')).rows.length,0)
    assert.equal((await db.query('update public.payroll_payments set voided_at=now() returning id')).rows.length,0)
    await assert.rejects(pay(randomUUID(),100),{code:'42501'})
  })
  await rollback('inactive managers cannot access balances',async()=>{
    await db.exec(`reset role;update public.users set active=false where id='${manager}';set role authenticated;`)
    assert.equal((await db.query('select * from public.payroll_balances()')).rows.length,0)
    await assert.rejects(pay(randomUUID(),100),{code:'42501'})
  })
  await rollback('payment history cannot be hard-deleted by the client',async()=>{
    await pay(randomUUID(),100)
    await assert.rejects(db.exec('delete from public.payroll_payments'),{code:'42501'})
  })
  await rollback('anonymous callers have no payment or balance access',async()=>{
    await db.exec('reset role;set role anon;')
    await assert.rejects(db.exec('select * from public.payroll_balances()'),{code:'42501'})
  })
})
