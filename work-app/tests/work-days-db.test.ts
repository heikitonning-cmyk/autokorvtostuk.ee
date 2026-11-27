import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { dayFixture } from './day-fixture.ts'

test('paid days keep object appointments and crew wages atomic and separate',async t=>{
  const {db,login,manager,operator,a,b}=await dayFixture();t.after(()=>db.close())
  const date='2026-11-16', newWorker=randomUUID()
  const day={start_minute:480,end_minute:900,break_minutes:0,next_day:false}
  const jobs=[0,1,2].map((_,i)=>({id:randomUUID(),address:`Example ${i+1}`,planned_time:`${String(8+i*2).padStart(2,'0')}:00`,planned_end_time:`${String(10+i*2).padStart(2,'0')}:00`,driver_employee_id:a,description:'Test',contact_phone:'',site_id:''}))
  const workers=[{id:a},{id:b},{id:newWorker,is_new:true,name:'New worker',hourly_rate_cents:1000}]
  const expected=async(d=date)=>({revision:(await db.query<any>('select revision from public.work_days where work_date=$1',[d])).rows[0]?.revision??0,
    jobs:(await db.query('select id,updated_at::text updated_at from public.jobs where planned_date=$1 and status<>\'tuhistatud\' order by id',[d])).rows,
    entries:(await db.query('select id,updated_at::text updated_at from public.payroll_entries where work_date=$1 order by id',[d])).rows})
  const save=(ex:any,js:any=jobs,ws:any=workers,d=date,tm:any=day,id:string=randomUUID())=>db.query('select public.save_work_day($1,$2,$3,$4,$5,$6)',[id,d,JSON.stringify(ex),JSON.stringify(tm),JSON.stringify(js),JSON.stringify(ws)])
  const entries=async(d=date)=>(await db.query<any>('select *,updated_at::text updated_at from public.payroll_entries where work_date=$1 order by employee_id',[d])).rows
  let firstExpected:any, firstId:string
  await t.test('three objects and three workers produce three wages, including a new employee',async()=>{
    firstExpected=await expected();firstId=randomUUID();await save(firstExpected,jobs,workers,date,day,firstId)
    const es=await entries();assert.equal(es.length,3)
    for(const e of es){assert.equal(e.paid_minutes,420);assert.equal(e.job_id,null);assert.ok(e.work_day_id)}
    assert.equal(es.find(e=>e.employee_id===a).wage_cents,8400)
    assert.equal((await db.query('select * from public.jobs where work_day_id is not null')).rows.length,3)
    await save(firstExpected,jobs,workers,date,day,firstId);assert.equal((await entries()).length,3)
  })
  const existingWorkers=workers.map(w=>({id:w.id}))
  await t.test('shared edits update all ordinary workers; driver exception and historical rate are retained',async()=>{
    await db.query('update public.payroll_employees set hourly_rate_cents=3000 where id=$1',[a])
    const crew=[{id:a,override:true,...day,start_minute:420},...existingWorkers.slice(1)]
    await save(await expected(),jobs,crew,date,{...day,end_minute:960})
    let es=await entries();assert.equal(es.find(e=>e.employee_id===a).paid_minutes,480);assert.equal(es.find(e=>e.employee_id===a).hourly_rate_cents,1200)
    assert.equal(es.find(e=>e.employee_id===b).paid_minutes,480)
    await save(await expected(),jobs.map(j=>({...j,planned_end_time:j.planned_end_time==='10:00'?'09:00':j.planned_end_time})),crew,date,{...day,end_minute:1020})
    es=await entries();assert.equal(es.find(e=>e.employee_id===a).paid_minutes,480);assert.equal(es.find(e=>e.employee_id===b).paid_minutes,540)
    await assert.rejects(save(firstExpected,jobs,existingWorkers),{code:'P0001'})
  })
  await t.test('invalid job, missing crew driver and employee creation roll back the entire save',async()=>{
    const before=await entries(), ex=await expected(),employee=randomUUID()
    await assert.rejects(save(ex,[...jobs.slice(0,2),{...jobs[2],planned_end_time:'07:00'}],[...existingWorkers,{id:employee,is_new:true,name:'Rollback',hourly_rate_cents:1000}]),{code:'23514'})
    assert.deepEqual(await entries(),before);assert.equal((await db.query('select id from public.payroll_employees where id=$1',[employee])).rows.length,0)
    await assert.rejects(save(ex,jobs,[{id:b}]),{code:'23514'})
    await assert.rejects(save(ex,jobs.slice(0,2),existingWorkers),{code:'23514'})
  })
  await t.test('old APIs cannot change managed payroll or appointment times',async()=>{
    const e=(await entries())[0]
    await assert.rejects(db.query('update public.payroll_entries set end_minute=1100 where id=$1',[e.id]),{code:'23514'})
    await assert.rejects(db.query('delete from public.payroll_entries where id=$1',[e.id]),{code:'23514'})
    await assert.rejects(db.query("update public.jobs set planned_time='06:00' where id=$1",[jobs[0].id]),{code:'23514'})
    await assert.rejects(db.query("insert into public.payroll_entries(employee_id,work_date,start_minute,end_minute) values($1,$2,1100,1200)",[a,date]),{code:'23514'})
  })
  await t.test('new bookings invalidate a previously opened day without partial changes',async()=>{
    const ex=await expected(),id=randomUUID()
    await db.query("insert into public.jobs(id,planned_date,address) values($1,$2,'Late booking')",[id,date])
    await assert.rejects(save(ex,jobs,existingWorkers),{code:'P0001'})
    await db.query('delete from public.jobs where id=$1',[id])
  })
  await t.test('explicit conversion merges legacy intervals, retains old rate, payments and an audit snapshot',async()=>{
    const d='2026-11-17'
    await db.query("insert into public.payroll_entries(employee_id,work_date,start_minute,end_minute,note) values($1,$2,480,600,'First'),($1,$2,660,900,'Second')",[a,d])
    const oldIds=(await entries(d)).map(e=>e.id)
    await db.query('select public.save_payroll_payment($1,$2,$3,$4,$5)',[randomUUID(),a,'2026-11-16',1000,'Paid'])
    const paymentBefore=(await db.query('select * from public.payroll_payments')).rows
    await db.query('update public.payroll_employees set hourly_rate_cents=4000 where id=$1',[a])
    await save(await expected(d),[],[{id:a}],d)
    const es=await entries(d);assert.equal(es.length,1);assert.ok(oldIds.includes(es[0].id));assert.equal(es[0].hourly_rate_cents,3000);assert.equal(es[0].wage_cents,21000)
    assert.deepEqual((await db.query('select * from public.payroll_payments')).rows,paymentBefore)
    const revision=(await db.query<any>('select previous_state from public.work_day_revisions r join public.work_days d on d.id=r.work_day_id where d.work_date=$1',[d])).rows[0]
    assert.equal(revision.previous_state.entries.length,2)
  })
  await t.test('mixed historical rates and running entries cannot be silently consolidated',async()=>{
    const d='2026-11-18'
    await db.query('insert into public.payroll_entries(employee_id,work_date,start_minute,end_minute) values($1,$2,480,600)',[b,d])
    await db.query('update public.payroll_employees set hourly_rate_cents=2500 where id=$1',[b])
    await db.query('insert into public.payroll_entries(employee_id,work_date,start_minute,end_minute) values($1,$2,660,900)',[b,d])
    await assert.rejects(save(await expected(d),[],[{id:b}],d),{code:'23514'})
    const running='2026-11-19'
    await db.query('insert into public.payroll_entries(employee_id,work_date,start_minute,end_minute) values($1,$2,480,null)',[b,running])
    await assert.rejects(save(await expected(running),[],[{id:b}],running),{code:'23514'})
  })
  await t.test('legacy appointments with unknown times remain editable without guessed schedules',async()=>{
    const d='2026-11-22',id=randomUUID()
    await db.query("insert into public.jobs(id,planned_date,address) values($1,$2,'Unscheduled example')",[id,d])
    await save(await expected(d),[{...jobs[0],id,planned_time:'',planned_end_time:'',driver_employee_id:''}],[],d)
    const saved=(await db.query<any>('select planned_time,planned_end_time,start_planned,end_planned from public.jobs where id=$1',[id])).rows[0]
    assert.deepEqual(saved,{planned_time:null,planned_end_time:null,start_planned:null,end_planned:null})
  })
  await t.test('overlap across midnight aborts the entire day',async()=>{
    await db.query('insert into public.payroll_entries(employee_id,work_date,start_minute,end_minute,next_day) values($1,$2,1320,540,true)',[a,'2026-11-20'])
    await assert.rejects(save(await expected('2026-11-21'),[],[{id:a}],'2026-11-21'),{code:'23P01'})
    assert.equal((await db.query("select id from public.work_days where work_date='2026-11-21'")).rows.length,0)
  })
  await t.test('operators, anonymous and inactive managers cannot read wages or write days',async()=>{
    const ex=await expected();await login(operator)
    assert.equal((await db.query('select * from public.work_days')).rows.length,0)
    assert.equal((await db.query('select * from public.work_day_revisions')).rows.length,0)
    await assert.rejects(save(ex,jobs,existingWorkers),{code:'42501'})
    await db.exec('reset role;set role anon');await assert.rejects(save(ex),{code:'42501'})
    await db.exec(`reset role;update public.users set active=false where id='${manager}'`);await login(manager)
    await assert.rejects(save(ex),{code:'42501'})
  })
})
