-- Manager-only wage records. Employees do not need an authentication account.
create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions;

create table public.payroll_employees (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  hourly_rate_cents integer not null check (hourly_rate_cents between 1 and 999999),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payroll_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.payroll_employees(id) on delete restrict,
  site_id uuid not null references public.customer_sites(id) on delete restrict,
  work_date date not null check (work_date between '2000-01-01' and '2099-12-31'),
  start_minute integer not null check (start_minute between 0 and 1439),
  end_minute integer not null check (end_minute between 0 and 1439),
  next_day boolean not null default false,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  hourly_rate_cents integer not null check (hourly_rate_cents between 1 and 999999),
  paid_minutes integer generated always as (end_minute + case when next_day then 1440 else 0 end - start_minute - break_minutes) stored,
  wage_cents integer generated always as (round((end_minute + case when next_day then 1440 else 0 end - start_minute - break_minutes)::numeric * hourly_rate_cents / 60)::integer) stored,
  note text not null default '' check (length(note) <= 1000),
  created_by uuid references public.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_valid_duration check (end_minute + case when next_day then 1440 else 0 end - start_minute between 1 and 1440),
  constraint payroll_positive_paid_time check (end_minute + case when next_day then 1440 else 0 end - start_minute - break_minutes > 0),
  -- Atomic protection against duplicates/overlaps, including across midnight.
  constraint payroll_no_overlap exclude using gist (
    employee_id with =,
    tsrange(work_date + start_minute * interval '1 minute', work_date + (end_minute + case when next_day then 1440 else 0 end) * interval '1 minute', '[)') with &&
  )
);

create index payroll_entries_month_idx on public.payroll_entries(work_date, id);
create index payroll_entries_site_idx on public.payroll_entries(site_id);

-- Capture rates at insertion, or when changing to a different employee.
-- Editing a past entry keeps its original rate even if today's rate has changed.
create function private.prepare_payroll_entry() returns trigger
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
  if tg_op = 'INSERT' or new.site_id is distinct from old.site_id then
    if not exists(select 1 from public.customer_sites where id = new.site_id and active) then
      raise exception 'Objekt puudub või on arhiveeritud.' using errcode = '23514';
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.prepare_payroll_entry() from public, anon, authenticated;
create trigger prepare_payroll_entry before insert or update on public.payroll_entries
for each row execute function private.prepare_payroll_entry();
create trigger payroll_employees_updated_at before update on public.payroll_employees
for each row execute function private.set_updated_at();

alter table public.payroll_employees enable row level security;
alter table public.payroll_entries enable row level security;
revoke all on public.payroll_employees, public.payroll_entries from anon, authenticated;
grant select, insert, update on public.payroll_employees to authenticated;
grant select, insert, update, delete on public.payroll_entries to authenticated;
create policy "manager manages payroll employees" on public.payroll_employees
for all to authenticated using ((select private.is_manager())) with check ((select private.is_manager()));
create policy "manager manages payroll entries" on public.payroll_entries
for all to authenticated using ((select private.is_manager())) with check ((select private.is_manager()));
