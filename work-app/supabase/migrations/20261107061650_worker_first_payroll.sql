-- Worker-first time tracking. NULL end = running; sites are optional labels.
alter table public.payroll_entries alter column site_id drop not null;
alter table public.payroll_entries alter column end_minute drop not null;
alter table public.payroll_entries add constraint payroll_running_shape
  check (end_minute is not null or (not next_day and break_minutes = 0));
create unique index payroll_one_running_per_employee
  on public.payroll_entries(employee_id) where end_minute is null;
-- Existing exclusion range becomes unbounded for a running entry, so it also
-- prevents manual entries from overlapping a timer and concurrent duplicate starts.

create table public.payroll_entry_sites (
  entry_id uuid not null references public.payroll_entries(id) on delete cascade,
  site_id uuid not null references public.customer_sites(id) on delete restrict,
  primary key (entry_id, site_id)
);
create index payroll_entry_sites_site_idx on public.payroll_entry_sites(site_id);
alter table public.payroll_entry_sites enable row level security;
revoke all on public.payroll_entry_sites from anon, authenticated;
grant select, insert, delete on public.payroll_entry_sites to authenticated;
create policy "manager manages payroll site labels" on public.payroll_entry_sites
  for all to authenticated using ((select private.is_manager()))
  with check ((select private.is_manager()));
insert into public.payroll_entry_sites(entry_id,site_id)
  select id,site_id from public.payroll_entries where site_id is not null;

create or replace function private.prepare_payroll_entry() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare employee public.payroll_employees%rowtype;
begin
  if tg_op = 'INSERT' or new.employee_id is distinct from old.employee_id then
    select * into employee from public.payroll_employees where id = new.employee_id for share;
    if not found or not employee.active then
      raise exception 'Tööline puudub või on arhiveeritud.' using errcode = '23514';
    end if;
    new.hourly_rate_cents := employee.hourly_rate_cents;
  else
    new.hourly_rate_cents := old.hourly_rate_cents;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  if new.site_id is not null and (tg_op = 'INSERT' or new.site_id is distinct from old.site_id) then
    if not exists(select 1 from public.customer_sites where id = new.site_id and active)
      and not (tg_op = 'UPDATE' and exists(select 1 from public.payroll_entry_sites where entry_id=old.id and site_id=new.site_id)) then
      raise exception 'Objekt puudub või on arhiveeritud.' using errcode = '23514';
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

-- Keep the old single-site API and existing entries compatible. The batch RPC
-- replaces this initial label set with all selected labels in the same transaction.
create function private.sync_payroll_primary_site() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.site_id is distinct from old.site_id then
    delete from public.payroll_entry_sites where entry_id = new.id;
    if new.site_id is not null then
      insert into public.payroll_entry_sites(entry_id,site_id) values(new.id,new.site_id);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_payroll_primary_site() from public, anon, authenticated;
create trigger sync_payroll_primary_site after insert or update of site_id on public.payroll_entries
  for each row execute function private.sync_payroll_primary_site();

create function public.save_payroll_entries(
  p_employee_ids uuid[], p_site_ids uuid[], p_work_date date,
  p_start_minute integer, p_end_minute integer, p_next_day boolean,
  p_break_minutes integer, p_note text,
  p_entry_id uuid default null, p_expected_version timestamptz default null,
  p_mode text default 'manual'
) returns integer language plpgsql security invoker set search_path = '' as $$
declare
  worker uuid; site uuid; saved_id uuid; existing public.payroll_entries%rowtype;
  local_now timestamp := date_trunc('minute', statement_timestamp() at time zone 'Europe/Tallinn');
  workers uuid[]; labels uuid[]; affected integer := 0;
begin
  if not coalesce(private.is_manager(),false) then raise exception 'Forbidden' using errcode = '42501'; end if;
  select array_agg(distinct v order by v) into workers from unnest(p_employee_ids) v;
  select coalesce(array_agg(distinct v order by v), '{}'::uuid[]) into labels from unnest(p_site_ids) v;
  if coalesce(cardinality(workers),0) not between 1 and 100 or array_position(workers,null) is not null
    or cardinality(labels) > 100 or array_position(labels,null) is not null
    or p_mode is null or p_mode not in ('manual','start')
    or (p_entry_id is not null and (cardinality(workers) <> 1 or p_mode <> 'manual')) then
    raise exception 'Invalid selection' using errcode = '23514';
  end if;
  if p_entry_id is not null then
    select * into existing from public.payroll_entries where id = p_entry_id for update;
    if not found or p_expected_version is null or existing.updated_at <> p_expected_version then
      raise exception 'Entry changed' using errcode = 'P0001';
    end if;
  end if;
  -- Active sites for new associations; preserve historical archived labels on edit.
  foreach site in array labels loop
    perform 1 from public.customer_sites s where s.id = site and (s.active or exists (
      select 1 from public.payroll_entry_sites es where es.entry_id = p_entry_id and es.site_id = site
    )) for key share;
    if not found then raise exception 'Invalid site' using errcode = '23514'; end if;
  end loop;
  if p_mode = 'start' then
    p_work_date := local_now::date;
    p_start_minute := extract(hour from local_now)::integer * 60 + extract(minute from local_now)::integer;
    p_end_minute := null; p_next_day := false; p_break_minutes := 0;
  elsif p_work_date is null or p_start_minute is null or p_end_minute is null
    or p_next_day is null or p_break_minutes is null then
    raise exception 'Missing time' using errcode = '23514';
  end if;
  foreach worker in array workers loop
    if p_entry_id is null then
      insert into public.payroll_entries(employee_id,site_id,work_date,start_minute,end_minute,next_day,break_minutes,note)
      values(worker,labels[1],p_work_date,p_start_minute,p_end_minute,p_next_day,p_break_minutes,coalesce(p_note,'')) returning id into saved_id;
    else
      update public.payroll_entries set employee_id=worker,site_id=labels[1],work_date=p_work_date,
        start_minute=p_start_minute,end_minute=p_end_minute,next_day=p_next_day,break_minutes=p_break_minutes,note=coalesce(p_note,'')
      where id=p_entry_id returning id into saved_id;
    end if;
    delete from public.payroll_entry_sites where entry_id=saved_id;
    insert into public.payroll_entry_sites(entry_id,site_id) select saved_id,unnest(labels);
    affected := affected + 1;
  end loop;
  return affected;
end;
$$;
revoke all on function public.save_payroll_entries(uuid[],uuid[],date,integer,integer,boolean,integer,text,uuid,timestamptz,text) from public, anon;
grant execute on function public.save_payroll_entries(uuid[],uuid[],date,integer,integer,boolean,integer,text,uuid,timestamptz,text) to authenticated;

create function public.finish_payroll_entries(p_entries jsonb, p_break_minutes integer default 0)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  selected record; existing public.payroll_entries%rowtype; affected integer := 0; elapsed integer;
  local_now timestamp := date_trunc('minute', statement_timestamp() at time zone 'Europe/Tallinn');
  finish_minute integer := extract(hour from local_now)::integer * 60 + extract(minute from local_now)::integer;
begin
  if not coalesce(private.is_manager(),false) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then raise exception 'Invalid entries' using errcode = '23514'; end if;
  if jsonb_array_length(p_entries) not between 1 and 100 or p_break_minutes is null or p_break_minutes not between 0 and 1439 then
    raise exception 'Invalid selection' using errcode = '23514';
  end if;
  -- Sorted row locks and transaction rollback keep multi-worker operations atomic.
  for selected in select * from jsonb_to_recordset(p_entries) as x(id uuid, updated_at timestamptz) order by id loop
    select * into existing from public.payroll_entries where id=selected.id for update;
    if not found or existing.end_minute is not null or selected.updated_at is null or existing.updated_at <> selected.updated_at then
      raise exception 'Entry changed' using errcode = 'P0001';
    end if;
    elapsed := (local_now::date - existing.work_date)*1440 + finish_minute - existing.start_minute;
    if elapsed not between 1 and 1440 or elapsed <= p_break_minutes then
      raise exception 'Invalid elapsed time' using errcode = 'P0002';
    end if;
    update public.payroll_entries set end_minute=finish_minute,
      next_day=local_now::date > work_date,break_minutes=p_break_minutes where id=existing.id;
    affected := affected + 1;
  end loop;
  return affected;
end;
$$;
revoke all on function public.finish_payroll_entries(jsonb,integer) from public, anon;
grant execute on function public.finish_payroll_entries(jsonb,integer) to authenticated;
