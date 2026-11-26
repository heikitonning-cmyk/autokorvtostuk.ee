import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dayFixture } from './day-fixture.ts'
import { defaultCustomerPricing } from '../src/lib/customer-pricing.ts'

test('continuation days preserve separate wages and share one complete immutable sheet',async t=>{
 const {db,login,manager,operator,a}=await dayFixture();t.after(()=>db.close())
 await db.exec(`reset role;alter table jobs add column vehicle_id uuid,add column price_snapshot_json jsonb,
 add column estimated_hours numeric default 2,add column estimated_drive_hours numeric default 0,add column estimated_km numeric default 0,
 add column estimated_helper_hours numeric default 0,add column helper_used boolean default false,
 add column operator_does_work boolean default false,add column operator_work_surcharge numeric,
 add column operator_work_hourly_rate numeric,add column manual_adjustment numeric default 0;`)
 for(const name of ['20261116142342_object_customer_pricing.sql','20261117125250_editable_work_day_date.sql','20261118063211_minimum_covers_entire_order.sql','20261119062940_job_invoice_tracking.sql','20261119100742_invoice_payer_name.sql','20261119101331_job_payer_to_invoice.sql','20261125055533_signed_job_delivery_sheets.sql','20261125064526_delivery_sheet_numbers.sql','20261126144241_multi_day_jobs.sql'])
   await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'))
 await login(manager)
 const root=randomUUID(),child=randomUUID(),day={start_minute:480,end_minute:960,break_minutes:30,next_day:false}
 const pricing=defaultCustomerPricing({hourlyRate:45,minimumOrder:90,driveHourlyRate:45,kmRate:1,helperHourlyRate:35,operatorWorkHourlyRate:15})
 const job={id:root,address:'Same object',payer_name:'Test payer',planned_time:'09:00',planned_end_time:'15:00',driver_employee_id:a,customer_pricing:pricing}
 const expected=async(date:string)=>({revision:(await db.query<any>('select revision from work_days where work_date=$1',[date])).rows[0]?.revision??0,
 jobs:(await db.query('select id,updated_at::text updated_at from jobs where planned_date=$1 order by id',[date])).rows,
 entries:(await db.query('select id,updated_at::text updated_at from payroll_entries where work_date=$1 order by id',[date])).rows})
 await db.query('select save_dated_work_day($1,$2,$2,$3,$4,$5,$6)',[randomUUID(),'2026-11-26',JSON.stringify(await expected('2026-11-26')),JSON.stringify(day),JSON.stringify([job]),JSON.stringify([{id:a}])])
 const source=(await db.query<any>('select *,updated_at::text version from jobs where id=$1',[root])).rows[0]
 const wages=(await db.query('select * from payroll_entries')).rows
 const ex=await expected('2026-11-27'),request=randomUUID(),second={...job,id:child,planned_end_time:'12:00'}
 const save=(date='2026-11-27',id=child,req=request,js:any=[second],exp:any=ex)=>db.query('select save_continuation_day($1,$2,$3,$4,$5,$6,$7,$8,$9)',[req,date,JSON.stringify(exp),JSON.stringify({...day,end_minute:810,break_minutes:0}),JSON.stringify(js),JSON.stringify([{id:a}]),root,id,source.version])
 await t.test('new date stores its own wage and does not change the first date',async()=>{
   await save();await save()
   assert.deepEqual((await db.query("select * from payroll_entries where work_date='2026-11-26'")).rows,wages)
   assert.deepEqual((await db.query('select work_date::text d,paid_minutes,wage_cents from payroll_entries order by work_date')).rows,[{d:'2026-11-26',paid_minutes:450,wage_cents:9000},{d:'2026-11-27',paid_minutes:330,wage_cents:6600}])
   assert.equal((await db.query<any>('select continuation_root_id,payer_name from jobs where id=$1',[child])).rows[0].continuation_root_id,root)
 })
 await t.test('same date, invalid times and stale source cannot create partial copies',async()=>{
   const id=randomUUID()
   await assert.rejects(save('2026-11-27',id,randomUUID(),[{...second,id}],await expected('2026-11-27')),/kuupäev/)
   await assert.rejects(save('2026-11-28',id,randomUUID(),[{...second,id,planned_end_time:'07:00'}],await expected('2026-11-28')),/lõpp/)
   assert.equal((await db.query("select * from work_days where work_date='2026-11-28'")).rows.length,0)
   await assert.rejects(db.query('update jobs set continuation_root_id=$1 where id=$2',[root,root]),/Lisa järgmine päev/)
 })
 const snapshots=async()=>(await db.query<any>('select id "jobId",updated_at::text "sourceUpdatedAt" from jobs where id=$1 or continuation_root_id=$1 order by id',[root])).rows
 const insert=(id:string,snapshot:any)=>db.query('insert into job_delivery_sheets(job_id,snapshot,signature,created_by) values($1,$2,$3,$4)',[id,JSON.stringify(snapshot),JSON.stringify([[[0,0],[20,20],[30,0]]]),manager])
 await t.test('signing requires every current day, at the root only',async()=>{
   await assert.rejects(insert(root,{version:1}),/puuduvad/)
   await assert.rejects(insert(root,{version:2,days:(await snapshots()).slice(0,1)}),/muutunud/)
   await assert.rejects(insert(child,{version:2,days:await snapshots()}),/ühine/)
   const stale=await snapshots();stale[0].sourceUpdatedAt='2000-01-01T00:00:00Z'
   await assert.rejects(insert(root,{version:2,days:stale}),/muutunud/)
   await insert(root,{version:2,days:await snapshots(),total:45000})
   await assert.rejects(insert(root,{version:2,days:await snapshots()}),/duplicate|unique/)
   assert.equal((await db.query('select * from job_delivery_sheets')).rows.length,1)
   await assert.rejects(db.query('delete from jobs where id=$1',[child]),/allkirjastatud/)
   await assert.rejects(save('2026-11-28',randomUUID(),randomUUID(),[],await expected('2026-11-28')),/allkirjastatud/)
 })
 await t.test('operator and anonymous cannot add days; operators can read the shared sheet',async()=>{
   await login(operator);await assert.rejects(save(),/õigus/)
   assert.equal((await db.query('select * from job_delivery_sheets')).rows.length,1)
   await db.exec('reset role;set role anon');await assert.rejects(save(),/permission denied/)
 })
})
