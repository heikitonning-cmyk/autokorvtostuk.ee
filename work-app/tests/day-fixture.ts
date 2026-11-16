import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const manager='10000000-0000-4000-8000-000000000001', operator='10000000-0000-4000-8000-000000000002'
const a='20000000-0000-4000-8000-000000000001', b='20000000-0000-4000-8000-000000000002'
const customer='30000000-0000-4000-8000-000000000001',site='30000000-0000-4000-8000-000000000002'
export async function dayFixture() {
  const db=new PGlite({extensions:{btree_gist}});
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
  for(const file of ['20261107061650_worker_first_payroll.sql','20261107063549_payroll_payments.sql','20261110095155_simple_dispatch.sql','20261110104500_require_driver_payroll.sql','20261110105855_job_planned_end_time.sql']) await db.exec(read(file))
  await db.exec(read('20261116123657_day_based_payroll.sql'))
  const login=async(id:string)=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`)
  await login(manager)
  await db.exec(`insert into public.payroll_employees(id,name,hourly_rate_cents) values('${a}','Payroll driver',1200),('${b}','Other driver',1500);`)
  return {db,login,manager,operator,a,b,site,customer}
}
