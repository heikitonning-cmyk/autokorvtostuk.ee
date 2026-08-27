create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  role text not null check (role in ('manager','operator')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'company' check (type in ('person','company')),
  name text not null,
  registry_code text,
  contact_name text,
  phone text,
  email text,
  billing_address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  registration_number text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.work_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  default_notes text,
  seasonal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  vehicle_id uuid references public.vehicles(id),
  operator_id uuid references public.users(id),
  start_planned timestamptz not null,
  end_planned timestamptz,
  address text not null,
  object_name text,
  work_type_id uuid not null references public.work_types(id),
  description text,
  access_notes text,
  status text not null default 'uus' check (status in ('uus','kinnitatud','teel','toob','tehtud','vajab_jareltegevust','tuhistatud')),
  price_snapshot_json jsonb,
  estimated_total numeric(12,2),
  estimated_hours numeric(8,2) not null default 2,
  estimated_drive_hours numeric(8,2) not null default 0,
  estimated_km numeric(10,1) not null default 0,
  estimated_helper_hours numeric(8,2) not null default 0,
  manual_adjustment numeric(12,2) not null default 0,
  manual_adjustment_reason text,
  actual_start timestamptz,
  actual_end timestamptz,
  actual_km numeric(10,1),
  helper_used boolean not null default false,
  helper_hours numeric(8,2),
  extra_work_description text,
  operator_note text,
  customer_confirmation boolean not null default false,
  billing_confirmed boolean not null default false,
  actual_total numeric(12,2),
  invoice_status text not null default 'puudub' check (invoice_status in ('puudub','valmis_arveks','arveldatud')),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  uploaded_by uuid not null references public.users(id),
  storage_path text not null unique,
  category text not null default 'during' check (category in ('before','during','after','issue')),
  created_at timestamptz not null default now()
);

create table if not exists public.job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete cascade,
  actor_id uuid references public.users(id),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists jobs_operator_start_idx on public.jobs(operator_id, start_planned);
create index if not exists jobs_status_start_idx on public.jobs(status, start_planned);
create index if not exists jobs_customer_idx on public.jobs(customer_id);
create index if not exists job_photos_job_idx on public.job_photos(job_id);
create index if not exists job_events_job_idx on public.job_events(job_id, created_at desc);

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid() and active = true
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = 'manager', false)
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.audit_job_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.job_events(job_id, actor_id, event_type, payload)
  values (
    coalesce(new.id, old.id),
    auth.uid(),
    lower(tg_op),
    jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.audit_settings_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.job_events(job_id, actor_id, event_type, payload)
  values (
    null,
    auth.uid(),
    'settings_' || lower(tg_op),
    jsonb_build_object('key', coalesce(new.key, old.key), 'old', to_jsonb(old), 'new', to_jsonb(new))
  );
  return coalesce(new, old);
end;
$$;

create trigger users_updated_at before update on public.users for each row execute function public.set_updated_at();
create trigger customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger work_types_updated_at before update on public.work_types for each row execute function public.set_updated_at();
create trigger jobs_updated_at before update on public.jobs for each row execute function public.set_updated_at();
create trigger settings_updated_at before update on public.settings for each row execute function public.set_updated_at();
create trigger jobs_audit_trigger after insert or update or delete on public.jobs for each row execute function public.audit_job_change();
create trigger settings_audit_trigger after insert or update or delete on public.settings for each row execute function public.audit_settings_change();

alter table public.users enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.work_types enable row level security;
alter table public.settings enable row level security;
alter table public.jobs enable row level security;
alter table public.job_photos enable row level security;
alter table public.job_events enable row level security;

create policy "authenticated can read own profile" on public.users
for select to authenticated using (id = auth.uid() or public.is_manager());
create policy "manager can manage users" on public.users
for all to authenticated using (public.is_manager()) with check (public.is_manager());

create policy "manager can manage customers" on public.customers
for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "operator can read assigned customers" on public.customers
for select to authenticated using (
  exists (select 1 from public.jobs j where j.customer_id = customers.id and j.operator_id = auth.uid())
);

create policy "authenticated can read vehicles" on public.vehicles
for select to authenticated using (public.current_app_role() in ('manager','operator'));
create policy "manager can manage vehicles" on public.vehicles
for all to authenticated using (public.is_manager()) with check (public.is_manager());

create policy "authenticated can read work types" on public.work_types
for select to authenticated using (public.current_app_role() in ('manager','operator'));
create policy "manager can manage work types" on public.work_types
for all to authenticated using (public.is_manager()) with check (public.is_manager());

create policy "manager can manage settings" on public.settings
for all to authenticated using (public.is_manager()) with check (public.is_manager());

create policy "manager can manage jobs" on public.jobs
for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "operator can read assigned jobs" on public.jobs
for select to authenticated using (operator_id = auth.uid());
create policy "operator can update assigned jobs" on public.jobs
for update to authenticated using (operator_id = auth.uid()) with check (operator_id = auth.uid());

create policy "manager can manage job photos" on public.job_photos
for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "operator can manage assigned job photos" on public.job_photos
for all to authenticated
using (exists (select 1 from public.jobs j where j.id = job_photos.job_id and j.operator_id = auth.uid()))
with check (uploaded_by = auth.uid() and exists (select 1 from public.jobs j where j.id = job_photos.job_id and j.operator_id = auth.uid()));

create policy "manager can read job events" on public.job_events
for select to authenticated using (public.is_manager());
create policy "operator can read assigned job events" on public.job_events
for select to authenticated using (
  job_id is not null and exists (select 1 from public.jobs j where j.id = job_events.job_id and j.operator_id = auth.uid())
);

insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', false)
on conflict (id) do update set public = false;

create policy "manager can manage all stored job photos" on storage.objects
for all to authenticated
using (bucket_id = 'job-photos' and public.is_manager())
with check (bucket_id = 'job-photos' and public.is_manager());

create policy "operator can manage assigned job photos" on storage.objects
for all to authenticated
using (
  bucket_id = 'job-photos'
  and exists (
    select 1 from public.job_photos p
    join public.jobs j on j.id = p.job_id
    where p.storage_path = name and j.operator_id = auth.uid()
  )
)
with check (
  bucket_id = 'job-photos'
  and split_part(name, '/', 1) in (
    select j.id::text from public.jobs j where j.operator_id = auth.uid()
  )
);
