import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'

test('manager explicitly removes a job with its sheet atomically, keeps issued invoices and numbering',async()=>{
 const db=new PGlite()
 const id='00000000-0000-0000-0000-000000000010'
 try {
  await db.exec(`create role authenticated;create role anon;create schema private;create schema auth;
   create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.actor',true),'')::uuid $$;
   create function private.is_manager() returns boolean language sql as $$ select current_setting('request.app_role',true)='manager' $$;
   grant usage on schema private,auth to authenticated;
   create table jobs(id uuid primary key);
   create table job_delivery_sheets(job_id uuid references jobs(id) on delete restrict);
   create table job_invoices(job_id uuid references jobs(id) on delete restrict);
   create table private.delivery_sheet_counters(last_number int);
   insert into private.delivery_sheet_counters values (1);
   insert into jobs values ('${id}');
   insert into job_delivery_sheets values ('${id}');`)
  await db.exec(readFileSync(new URL('../supabase/migrations/20261125114536_delete_job_with_test_sheet.sql',import.meta.url),'utf8'))
  await db.exec("set role authenticated;set request.actor='00000000-0000-0000-0000-000000000001';set request.app_role='operator'")
  await assert.rejects(db.exec(`select public.delete_job_with_sheet('${id}',true)`),/Ainult juhataja/)
  await db.exec("set request.app_role='manager'")
  await assert.rejects(db.exec(`select public.delete_job_with_sheet('${id}',false)`),/delete-sheet/)
  await db.exec('reset role')
  assert.equal((await db.query('select * from job_delivery_sheets')).rows.length,1)
  await db.exec(`insert into job_invoices values ('${id}');set role authenticated`)
  await assert.rejects(db.exec(`select public.delete_job_with_sheet('${id}',true)`),/delete-invoice/)
  await db.exec('reset role')
  assert.equal((await db.query('select * from job_delivery_sheets')).rows.length,1)
  await db.exec('delete from job_invoices;set role authenticated')
  await db.exec(`select public.delete_job_with_sheet('${id}',true)`)
  await db.exec('reset role')
  assert.equal((await db.query('select * from jobs')).rows.length,0)
  assert.equal((await db.query('select * from job_delivery_sheets')).rows.length,0)
  assert.equal((await db.query<{last_number:number}>('select last_number from private.delivery_sheet_counters')).rows[0].last_number,1)
  await db.exec('set role anon')
  await assert.rejects(db.exec(`select public.delete_job_with_sheet('${id}',true)`),/permission denied/)
 }finally{await db.close()}
})
