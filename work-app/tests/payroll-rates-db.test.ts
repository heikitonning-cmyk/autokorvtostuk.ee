import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dayFixture } from './day-fixture.ts'

test('effective wage rates recalculate dates atomically without changing hours or payments',async t=>{
 const {db,login,manager,operator,a,b}=await dayFixture();t.after(()=>db.close())
 await db.exec('reset role')
 await db.exec(readFileSync(new URL('../supabase/migrations/20261120105502_effective_payroll_rates.sql',import.meta.url),'utf8'))
 await login(manager)
 const employee=async()=>(await db.query<any>('select *,updated_at::text version from payroll_employees where id=$1',[a])).rows[0]
 const rows=async()=>(await db.query<any>('select *,updated_at::text version from payroll_entries where employee_id=$1 order by work_date',[a])).rows
 const change=async(date:string|null,rate:number,version?:string)=>db.query<any>('select save_payroll_employee_rate($1,$2,$3,true,$4,$5) result',[a,version??(await employee()).version,'Payroll driver',rate,date])
 await db.exec("insert into payroll_entries(employee_id,work_date,start_minute,end_minute,break_minutes) values ('"+a+"','2026-01-01',480,600,0),('"+a+"','2026-01-02',480,600,0),('"+a+"','2026-01-04',480,600,0)")
 const expected={revision:0,jobs:[],entries:[]}
 await db.query('select save_work_day($1,$2,$3,$4,$5,$6)',[randomUUID(),'2026-01-03',JSON.stringify(expected),JSON.stringify({start_minute:480,end_minute:600,next_day:false,break_minutes:0}),JSON.stringify([1,2,3].map(i=>({id:randomUUID(),address:'Object '+i,driver_employee_id:a}))),JSON.stringify([{id:a},{id:b}])])
 const originals=await rows()
 await t.test('backdated changes include managed days and preserve earlier dates',async()=>{
  await change('2026-01-02',1500)
  assert.deepEqual((await rows()).map(e=>e.hourly_rate_cents),[1200,1500,1500,1500])
  assert.deepEqual((await rows()).map(e=>e.paid_minutes),[120,120,120,120])
  assert.equal((await rows())[2].wage_cents,3000)
  assert.equal((await db.query<any>('select hourly_rate_cents from payroll_entries where employee_id=$1',[b])).rows[0].hourly_rate_cents,1500)
 })
 await t.test('later effective rates survive earlier corrections and same-date corrections replace once',async()=>{
  await change('2026-01-04',1800)
  await change('2026-01-01',1400)
  assert.deepEqual((await rows()).map(e=>e.hourly_rate_cents),[1400,1500,1500,1800])
  await change('2026-01-02',1600)
  assert.deepEqual((await rows()).map(e=>e.hourly_rate_cents),[1400,1600,1600,1800])
  assert.equal((await employee()).hourly_rate_cents,1800)
  assert.equal((await db.query('select * from payroll_rate_history')).rows.length,3)
 })
 await t.test('new historical entries and moved entries use effective date, earlier entries use baseline',async()=>{
  await db.query('insert into payroll_entries(employee_id,work_date,start_minute,end_minute) values($1,$2,480,600)',[a,'2026-01-05'])
  assert.equal((await rows()).at(-1).hourly_rate_cents,1800)
  await db.query('insert into payroll_entries(employee_id,work_date,start_minute,end_minute) values($1,$2,480,600)',[a,'2025-12-31'])
  assert.equal((await rows())[0].hourly_rate_cents,1200)
  await db.query("update payroll_entries set work_date='2026-01-06' where employee_id=$1 and work_date='2025-12-31'",[a])
  assert.equal((await rows()).at(-1).hourly_rate_cents,1800)
  await db.query("update payroll_entries set end_minute=660 where employee_id=$1 and work_date='2026-01-02'",[a])
  assert.equal((await rows())[1].hourly_rate_cents,1600)
 })
 await t.test('stale versions, invalid rates and missing dates cannot partially save',async()=>{
  const before=await rows(),e=await employee()
  await assert.rejects(change('2026-01-02',1700,originals[0].version),{code:'P0001'})
  await assert.rejects(change('2026-01-02',0),{code:'23514'})
  await assert.rejects(change('2099-12-31',1700),{code:'23514'})
  await assert.rejects(change(null,1700),{code:'23514'})
  assert.deepEqual(await rows(),before);assert.equal((await employee()).version,e.version)
 })
 await t.test('payments remain unchanged; balances use recalculated earned wages',async()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261107063549_payroll_payments.sql',import.meta.url),'utf8')
  assert.ok(sql.includes('payroll_payments'))
  await db.exec('reset role')
  await db.query("insert into payroll_payments(employee_id,paid_date,amount_cents,id) values($1,'2026-01-01',1000,$2)",[a,randomUUID()])
  await login(manager)
  const before=(await db.query('select * from payroll_payments')).rows
  await change('2026-01-02',1700)
  assert.deepEqual((await db.query('select * from payroll_payments')).rows,before)
  const balance=(await db.query<any>('select * from payroll_balances() where employee_id=$1',[a])).rows[0]
  assert.equal(Number(balance.earned_cents),(await rows()).reduce((s,e)=>s+e.wage_cents,0))
  assert.equal(Number(balance.balance_cents),Number(balance.earned_cents)-1000)
 })
 await t.test('history and audit are manager-only; operators cannot mutate wages',async()=>{
  assert.ok((await db.query('select * from payroll_rate_audit')).rows.length>=5)
  await login(operator)
  assert.equal((await db.query('select * from payroll_rate_history')).rows.length,0)
  await assert.rejects(change('2026-01-02',2000,'2026-01-01'),{code:'42501'})
  await assert.rejects(db.query("insert into payroll_rate_history values($1,'2026-01-01',2000,1200,now(),null)",[a]),{code:'42501'})
  await db.exec('reset role;set role anon')
  await assert.rejects(db.query('select * from payroll_rate_history'),{code:'42501'})
  await assert.rejects(db.query("select save_payroll_employee_rate($1,now(),'Test',true,2000,'2026-01-01')",[a]),{code:'42501'})
 })
})
