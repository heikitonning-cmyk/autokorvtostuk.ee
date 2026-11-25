import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

test('signed sheets persist, enforce job access, reject duplicates and cannot be changed or cascaded away',async()=>{
  const db=new PGlite()
  try {
    await db.exec(`create role authenticated;create role anon;create schema auth;create schema private;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.actor',true),'')::uuid $$;
      create table public.users(id uuid primary key,role text,active boolean);
      create table public.jobs(id uuid primary key,status text);
      create function private.current_app_role() returns text language sql stable security definer set search_path=public as $$ select role from users where id=auth.uid() and active $$;
      grant usage on schema auth,private to authenticated;grant select on jobs to authenticated;
      alter table jobs enable row level security;
      create policy job_access on jobs for select to authenticated using (private.current_app_role()='manager' or (private.current_app_role()='operator' and status<>'tuhistatud'));
      insert into users values ('00000000-0000-0000-0000-000000000001','operator',true),('00000000-0000-0000-0000-000000000002','operator',false);
      insert into jobs values ('00000000-0000-0000-0000-000000000010','uus'),('00000000-0000-0000-0000-000000000020','tuhistatud');`)
    await db.exec(readFileSync(new URL('../supabase/migrations/20261125055533_signed_job_delivery_sheets.sql',import.meta.url),'utf8'))
    await db.exec(`set role authenticated;set request.actor='00000000-0000-0000-0000-000000000001';`)
    const sql=`insert into job_delivery_sheets(job_id,snapshot,signature,created_by) values ('00000000-0000-0000-0000-000000000010','{"total":9000}','[[[0,0],[10,10],[20,5]]]','00000000-0000-0000-0000-000000000001')`
    await db.exec(sql)
    assert.equal((await db.query<{snapshot:{total:number}}>('select snapshot from job_delivery_sheets')).rows[0].snapshot.total,9000)
    await assert.rejects(db.exec(sql),/unique|duplicate/i)
    await assert.rejects(db.exec(`update job_delivery_sheets set snapshot='{}'`),/permission denied/i)
    await assert.rejects(db.exec(`delete from job_delivery_sheets`),/permission denied/i)
    await assert.rejects(db.exec(sql.replaceAll('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000020')),/row-level security/i)
    await db.exec(`set request.actor='00000000-0000-0000-0000-000000000002'`)
    assert.equal((await db.query('select * from job_delivery_sheets')).rows.length,0)
    await assert.rejects(db.exec(sql),/row-level security/i)
    await db.exec('reset role;set role anon')
    await assert.rejects(db.exec('select * from job_delivery_sheets'),/permission denied/i)
    await db.exec('reset role')
    await assert.rejects(db.exec(`delete from jobs where id='00000000-0000-0000-0000-000000000010'`),/foreign key/i)
    assert.equal((await db.query('select * from job_delivery_sheets')).rows.length,1)
  }finally{await db.close()}
})
