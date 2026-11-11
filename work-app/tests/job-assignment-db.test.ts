import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const manager='10000000-0000-4000-8000-000000000001',operator='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003',inactive='10000000-0000-4000-8000-000000000004',job='20000000-0000-4000-8000-000000000001'
test('manager dispatch is enforced by real migration for RPC and direct writes',async t=>{
  const db=new PGlite();t.after(()=>db.close())
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.users(id uuid primary key,role text,active boolean);
    create table public.jobs(id uuid primary key,operator_id uuid references public.users(id),status text default 'uus',updated_at timestamptz default now());
    insert into public.users values('${manager}','manager',true),('${operator}','operator',true),('${other}','operator',true),('${inactive}','operator',false);
    create function public.claim_job(p_job_id uuid) returns void language sql security definer as $$update public.jobs set operator_id=auth.uid() where id=p_job_id$$;
    create function public.release_job(p_job_id uuid) returns void language sql security definer as $$update public.jobs set operator_id=null where id=p_job_id$$;
    grant usage on schema auth,private to authenticated;grant select on public.users to authenticated;
    grant select,insert,update on public.jobs to authenticated;
    insert into public.jobs(id) values('${job}');`)
  const helpers=readFileSync(new URL('../supabase/migrations/20260822205000_harden_helper_functions.sql',import.meta.url),'utf8')
  await db.exec(helpers.slice(0,helpers.indexOf('create or replace function private.audit_job_change')))
  await db.exec(`create trigger jobs_updated_at before update on public.jobs for each row execute function private.set_updated_at();
    alter table public.jobs enable row level security;
    create policy manager on public.jobs for all to authenticated using(private.is_manager()) with check(private.is_manager());
    create policy assigned_read on public.jobs for select to authenticated using(true);
    create policy assigned_update on public.jobs for update to authenticated using(operator_id=auth.uid()) with check(operator_id=auth.uid());`)
  await db.exec(readFileSync(new URL('../supabase/migrations/20261107073322_manager_job_assignment.sql',import.meta.url),'utf8'))
  const login=async(id:string)=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`)
  const assign=async(id:string|null,version?:string)=>{
    const v=version??(await db.query<{version:string}>(`select updated_at::text version from public.jobs where id='${job}'`)).rows[0].version
    return db.query('select public.assign_job_operator($1,$2,$3)',[job,id,v])
  }
  await login(manager)
  await t.test('manager assigns, reassigns, removes and assigns self',async()=>{
    for(const who of [operator,other,null,manager]){
      await assign(who)
      assert.equal((await db.query<any>(`select operator_id from public.jobs where id='${job}'`)).rows[0].operator_id,who)
    }
  })
  await t.test('stale update cannot overwrite the current operator',async()=>{
    const v=(await db.query<any>(`select updated_at::text version from public.jobs where id='${job}'`)).rows[0].version
    await assign(operator)
    await assert.rejects(assign(other,v),{code:'P0001'})
  })
  await t.test('inactive and missing operators are rejected',async()=>{
    await assert.rejects(assign(inactive),{code:'23514'})
    await assert.rejects(assign('10000000-0000-4000-8000-000000000099'),{code:'23514'})
  })
  await t.test('operator cannot claim, release, call assignment or alter own assignment',async()=>{
    await login(operator)
    await assert.rejects(db.query('select public.claim_job($1)',[job]),{code:'42501'})
    await assert.rejects(db.query('select public.release_job($1)',[job]),{code:'42501'})
    await assert.rejects(assign(operator),{code:'42501'})
    await assert.rejects(db.query('update public.jobs set operator_id=null where id=$1',[job]),{code:'42501'})
    await assert.rejects(db.query('update public.jobs set operator_id=$2 where id=$1',[job,other]),{code:'42501'})
    await db.query("update public.jobs set status='toob' where id=$1",[job])
  })
  await t.test('manager can create an assigned job but cannot rewrite closed job ownership',async()=>{
    await login(manager)
    await db.query("insert into public.jobs(id,operator_id) values(gen_random_uuid(),$1)",[other])
    for(const status of ['completed','tehtud','vajab_jareltegevust','tuhistatud']){
      await db.query('update public.jobs set status=$2 where id=$1',[job,status])
      await assert.rejects(assign(other),{code:'23514'})
      await assert.rejects(db.query('update public.jobs set operator_id=$2 where id=$1',[job,other]),{code:'23514'})
    }
  })
  await t.test('anonymous and inactive manager cannot assign',async()=>{
    await db.exec('reset role;set role anon')
    await assert.rejects(db.query('select public.assign_job_operator($1,$2,now())',[job,other]),{code:'42501'})
    await db.exec(`reset role;update public.users set active=false where id='${manager}'`)
    await login(manager)
    await assert.rejects(db.query('select public.assign_job_operator($1,$2,now())',[job,other]),{code:'42501'})
  })
})
