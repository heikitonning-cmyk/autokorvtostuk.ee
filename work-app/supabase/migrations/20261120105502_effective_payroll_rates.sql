-- Effective-dated wage changes; no existing wages or payments change on migration.
create table public.payroll_rate_history (
 employee_id uuid not null references public.payroll_employees(id) on delete restrict,
 effective_from date not null check(effective_from between '2000-01-01' and '2099-12-31'),
 hourly_rate_cents integer not null check(hourly_rate_cents between 1 and 999999),
 previous_rate_cents integer not null check(previous_rate_cents between 1 and 999999),
 updated_at timestamptz not null default clock_timestamp(),
 updated_by uuid references public.users(id) default auth.uid(),
 primary key(employee_id,effective_from)
);
create index payroll_rate_history_user_idx on public.payroll_rate_history(updated_by);
create table public.payroll_rate_audit (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.payroll_employees(id),
 effective_from date not null,
 hourly_rate_cents integer not null,
 previous_history jsonb not null,
 previous_entries jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 created_by uuid references public.users(id) default auth.uid()
);
create index payroll_rate_audit_employee_idx on public.payroll_rate_audit(employee_id);
create index payroll_rate_audit_user_idx on public.payroll_rate_audit(created_by);
alter table public.payroll_rate_history enable row level security;
alter table public.payroll_rate_audit enable row level security;
revoke all on public.payroll_rate_history,public.payroll_rate_audit from public,anon,authenticated;
grant select on public.payroll_rate_history,public.payroll_rate_audit to authenticated;
create policy manager_rate_read on public.payroll_rate_history for select to authenticated using((select private.is_manager()));
create policy manager_rate_audit_read on public.payroll_rate_audit for select to authenticated using((select private.is_manager()));

create or replace function private.prepare_payroll_entry() returns trigger
language plpgsql security invoker set search_path='' as $$
declare employee public.payroll_employees%rowtype; scheduled integer; baseline integer;
begin
 if tg_op='INSERT' or new.employee_id is distinct from old.employee_id then
  select * into employee from public.payroll_employees where id=new.employee_id for share;
  if not found or not employee.active then raise exception 'Tööline puudub või on arhiveeritud.' using errcode='23514'; end if;
  select previous_rate_cents into baseline from public.payroll_rate_history where employee_id=new.employee_id order by effective_from limit 1;
  new.hourly_rate_cents:=coalesce(baseline,employee.hourly_rate_cents);
 else
  new.hourly_rate_cents:=old.hourly_rate_cents;
  new.created_by:=old.created_by;new.created_at:=old.created_at;
  if new.work_date is distinct from old.work_date then
   select previous_rate_cents into baseline from public.payroll_rate_history where employee_id=new.employee_id order by effective_from limit 1;
   new.hourly_rate_cents:=coalesce(baseline,old.hourly_rate_cents);
  end if;
 end if;
 -- Dates covered by an explicit rate always use that rate, including later edits.
 select hourly_rate_cents into scheduled from public.payroll_rate_history
  where employee_id=new.employee_id and effective_from<=new.work_date order by effective_from desc limit 1;
 new.hourly_rate_cents:=coalesce(scheduled,new.hourly_rate_cents);
 if new.site_id is not null and (tg_op='INSERT' or new.site_id is distinct from old.site_id) then
  if not exists(select 1 from public.customer_sites where id=new.site_id and active)
    and not(tg_op='UPDATE' and exists(select 1 from public.payroll_entry_sites where entry_id=old.id and site_id=new.site_id)) then
   raise exception 'Objekt puudub või on arhiveeritud.' using errcode='23514';
  end if;
 end if;
 new.updated_at:=clock_timestamp();
 return new;
end;$$;
revoke all on function private.prepare_payroll_entry() from public,anon,authenticated;

create function public.save_payroll_employee_rate(
 p_employee_id uuid,p_expected_version timestamptz,p_name text,p_active boolean,
 p_rate integer,p_effective_from date default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare employee public.payroll_employees%rowtype; d date; next_date date; baseline integer;
 changed integer:=0; difference bigint:=0; before_sum bigint; old_history jsonb; old_entries jsonb;
 old_day_write text:=current_setting('app.work_day_write',true);
begin
 if not coalesce(private.is_manager(),false) then raise exception 'Puudub juhataja õigus.' using errcode='42501'; end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 120 or p_active is null or p_rate is null or p_rate not between 1 and 999999 then
  raise exception 'Kontrolli töölise andmeid ja tunnihinda.' using errcode='23514';
 end if;
 if p_effective_from is not null and (p_effective_from<'2000-01-01' or p_effective_from>(now() at time zone 'Europe/Tallinn')::date) then
  raise exception 'Vali tänane või varasem kehtivuse alguskuupäev.' using errcode='23514';
 end if;
 -- Same date-lock order as day writes. Rate changes and their audit are atomic.
 for d in select distinct work_date from public.payroll_entries
  where employee_id=p_employee_id and p_effective_from is not null and work_date>=p_effective_from order by work_date loop
  perform pg_advisory_xact_lock(hashtextextended('work-day:'||d::text,0));
 end loop;
 select * into employee from public.payroll_employees where id=p_employee_id for update;
 if not found or p_expected_version is null or employee.updated_at is distinct from p_expected_version then
  raise exception 'Töölise andmeid on vahepeal muudetud. Värskenda lehte.' using errcode='P0001';
 end if;
 if p_effective_from is null and p_rate<>employee.hourly_rate_cents then
  raise exception 'Tunnihinna muutmisel vali kehtivuse algus.' using errcode='23514';
 end if;
 if p_effective_from is not null then
  select coalesce(jsonb_agg(to_jsonb(h) order by effective_from),'[]') into old_history from public.payroll_rate_history h where employee_id=p_employee_id;
  select previous_rate_cents into baseline from public.payroll_rate_history where employee_id=p_employee_id order by effective_from limit 1;
  baseline:=coalesce(baseline,employee.hourly_rate_cents);
  insert into public.payroll_rate_history(employee_id,effective_from,hourly_rate_cents,previous_rate_cents)
   values(p_employee_id,p_effective_from,p_rate,baseline)
   on conflict(employee_id,effective_from) do update set hourly_rate_cents=excluded.hourly_rate_cents,updated_at=clock_timestamp(),updated_by=auth.uid();
  select min(effective_from) into next_date from public.payroll_rate_history where employee_id=p_employee_id and effective_from>p_effective_from;
  select coalesce(jsonb_agg(to_jsonb(e) order by work_date,id),'[]'),coalesce(sum(wage_cents),0)
   into old_entries,before_sum from public.payroll_entries e
   where employee_id=p_employee_id and work_date>=p_effective_from and (next_date is null or work_date<next_date);
  perform set_config('app.work_day_write','yes',true);
  update public.payroll_entries set hourly_rate_cents=p_rate where employee_id=p_employee_id and work_date>=p_effective_from
   and (next_date is null or work_date<next_date) and hourly_rate_cents<>p_rate;
  get diagnostics changed=row_count;
  select coalesce(sum(wage_cents),0)-before_sum into difference from public.payroll_entries
   where employee_id=p_employee_id and work_date>=p_effective_from and (next_date is null or work_date<next_date);
  insert into public.payroll_rate_audit(employee_id,effective_from,hourly_rate_cents,previous_history,previous_entries)
   values(p_employee_id,p_effective_from,p_rate,old_history,old_entries);
  perform set_config('app.work_day_write',coalesce(old_day_write,''),true);
 end if;
 update public.payroll_employees set name=btrim(p_name),active=p_active,hourly_rate_cents=coalesce(
  (select hourly_rate_cents from public.payroll_rate_history where employee_id=p_employee_id and effective_from<=(now() at time zone 'Europe/Tallinn')::date order by effective_from desc limit 1),
  employee.hourly_rate_cents) where id=p_employee_id returning * into employee;
 return jsonb_build_object('id',employee.id,'updated_at',employee.updated_at,'changed_entries',changed,'difference_cents',difference,'hourly_rate_cents',employee.hourly_rate_cents);
end;$$;
revoke all on function public.save_payroll_employee_rate(uuid,timestamptz,text,boolean,integer,date) from public,anon;
grant execute on function public.save_payroll_employee_rate(uuid,timestamptz,text,boolean,integer,date) to authenticated;
