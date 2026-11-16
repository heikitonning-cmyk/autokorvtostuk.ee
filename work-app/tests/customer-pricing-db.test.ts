import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dayFixture } from './day-fixture.ts'
import { customerPrice,defaultCustomerPricing } from '../src/lib/customer-pricing.ts'

test('customer pricing persists with the paid day without changing wage calculations',async t=>{
  const {db,login,manager,operator,a}=await dayFixture();t.after(()=>db.close())
  await db.exec(`reset role;
    alter table public.jobs add column price_snapshot_json jsonb,add column estimated_hours numeric(8,2) not null default 2,
      add column estimated_drive_hours numeric(8,2) not null default 0,add column estimated_km numeric(10,1) not null default 0,
      add column estimated_helper_hours numeric(8,2) not null default 0,add column helper_used boolean not null default false,
      add column operator_does_work boolean not null default false,add column operator_work_surcharge numeric,
      add column operator_work_hourly_rate numeric,add column manual_adjustment numeric not null default 0;`)
  await db.exec(readFileSync(new URL('../supabase/migrations/20261116142342_object_customer_pricing.sql',import.meta.url),'utf8'))
  await login(manager)
  const date='2026-11-16',id=randomUUID(),p=defaultCustomerPricing({hourlyRate:45,minimumOrder:90,driveHourlyRate:45,kmRate:1,helperHourlyRate:35,operatorWorkHourlyRate:15})
  const day={start_minute:480,end_minute:900,break_minutes:0,next_day:false}
  const job={id,address:'Example 1',planned_time:'09:30',planned_end_time:'10:40',driver_employee_id:a,customer_pricing:p}
  const expected=async()=>({revision:(await db.query<any>('select revision from public.work_days where work_date=$1',[date])).rows[0]?.revision??0,
    jobs:(await db.query('select id,updated_at::text updated_at from public.jobs where planned_date=$1 order by id',[date])).rows,
    entries:(await db.query('select id,updated_at::text updated_at from public.payroll_entries where work_date=$1 order by id',[date])).rows})
  const save=(ex:any,j:any=job,requestId:string=randomUUID(),tm:any=day)=>db.query('select public.save_priced_work_day($1,$2,$3,$4,$5,$6)',[requestId,date,JSON.stringify(ex),JSON.stringify(tm),JSON.stringify([j]),JSON.stringify([{id:a}])])
  const getJob=async()=>(await db.query<any>('select * from public.jobs where id=$1',[id])).rows[0]
  const wage=async()=>(await db.query<any>('select paid_minutes,wage_cents from public.payroll_entries where work_date=$1',[date])).rows
  const first=await expected(),request=randomUUID()
  await t.test('minute-based calculation, minimum and paid day remain separate',async()=>{
    await save(first,job,request)
    assert.equal(Number((await getJob()).estimated_total),90)
    assert.deepEqual(await wage(),[{paid_minutes:420,wage_cents:8400}])
  })
  await t.test('client and database match for helper counts, special rates and minute rounding',async()=>{
    for(const patch of [{operator_work:true,helper_count:2},{minimum:0,lift_rate:4000,driver_rate:1200,operator_work:true,operator_minutes:30,helper_count:3,helper_minutes:45,drive_minutes:30,km:12.5,adjustment:-500},{agreed_total:12345},{agreed_total:0}]) {
      const pricing={...p,...patch};await save(await expected(),{...job,customer_pricing:pricing})
      assert.equal(Math.round(Number((await getJob()).estimated_total)*100),customerPrice(pricing,'09:30','10:40').total)
      assert.deepEqual(await wage(),[{paid_minutes:420,wage_cents:8400}])
    }
  })
  await t.test('old retries cannot overwrite later customer agreements',async()=>{
    await save(first,job,request)
    assert.equal(Number((await getJob()).estimated_total),0)
  })
  await t.test('old day client edits recalculate a saved hourly quote but retain its rates',async()=>{
    const pricing={...p,minimum:0,lift_rate:4000};await save(await expected(),{...job,customer_pricing:pricing})
    await db.query('select public.save_work_day($1,$2,$3,$4,$5,$6)',[randomUUID(),date,JSON.stringify(await expected()),JSON.stringify(day),JSON.stringify([{...job,planned_end_time:'11:30'}]),JSON.stringify([{id:a}])])
    assert.equal(Number((await getJob()).estimated_total),80)
    assert.equal((await getJob()).customer_pricing.lift_rate,4000)
  })
  await t.test('bad prices roll back appointments, the day revision and wages together',async()=>{
    const before=await getJob(),ex=await expected(),wages=await wage()
    for(const patch of [{lift_rate:-1},{helper_count:2.5},{helper_count:51},{billed_minutes:0},{minimum:null},{km:1.234}]) {
      await assert.rejects(save(ex,{...job,address:'Must roll back',customer_pricing:{...p,...patch}},randomUUID(),{...day,end_minute:960}),{code:'23514'})
      assert.deepEqual(await getJob(),before);assert.deepEqual(await expected(),ex);assert.deepEqual(await wage(),wages)
    }
  })
  await t.test('a stale editor cannot replace a newer quote',async()=>{
    const ex=await expected();await save(ex,{...job,customer_pricing:{...p,agreed_total:10000}})
    await assert.rejects(save(ex),{code:'P0001'})
  })
  await t.test('operator and anonymous cannot write prices or call the paid-day save',async()=>{
    const ex=await expected();await db.query('update public.jobs set operator_id=$1 where id=$2',[operator,id]);await login(operator)
    await assert.rejects(save(ex),{code:'42501'})
    await assert.rejects(db.query('update public.jobs set customer_pricing=$1 where id=$2',[JSON.stringify(p),id]),{code:'42501'})
    await assert.rejects(db.query('update public.jobs set estimated_total=1 where id=$1',[id]),{code:'42501'})
    await db.exec('reset role;set role anon');await assert.rejects(save(ex),{code:'42501'})
  })
})
