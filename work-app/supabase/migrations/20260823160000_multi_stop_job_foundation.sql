create table if not exists public.job_stops (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  site_id uuid references public.customer_sites(id),
  sequence_no integer not null,
  name_snapshot text,
  address_snapshot text not null,
  description text,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done', 'skipped')),
  actual_start timestamptz,
  actual_end timestamptz,
  completion_note text,
  completed_by uuid references public.users(id),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, job_id),
  unique (job_id, sequence_no)
);

create index if not exists job_stops_job_sequence_idx
  on public.job_stops(job_id, sequence_no);

create index if not exists job_stops_site_idx
  on public.job_stops(site_id);

create unique index if not exists job_stops_one_in_progress_per_job
  on public.job_stops(job_id) where status = 'in_progress';

alter table public.jobs
  add column if not exists route_revision bigint not null default 0;

alter table public.jobs
  add column if not exists route_start_site_id uuid references public.customer_sites(id);

alter table public.jobs
  add column if not exists route_start_address text;

alter table public.jobs
  add column if not exists route_end_site_id uuid references public.customer_sites(id);

alter table public.jobs
  add column if not exists route_end_address text;

alter table public.job_photos
  add column if not exists job_stop_id uuid;

create index if not exists job_photos_job_stop_idx
  on public.job_photos(job_stop_id);

do $$
begin
  alter table public.job_photos
    add constraint job_photos_stop_same_job_fkey
    foreign key (job_stop_id, job_id)
    references public.job_stops(id, job_id)
    on delete cascade;
exception
  when duplicate_object then null;
end
$$;

alter table public.job_stops enable row level security;

drop policy if exists "manager can read job stops" on public.job_stops;
create policy "manager can read job stops" on public.job_stops
for select to authenticated
using (private.current_app_role() = 'manager');

drop policy if exists "operator can read visible job stops" on public.job_stops;
create policy "operator can read visible job stops" on public.job_stops
for select to authenticated
using (
  private.current_app_role() = 'operator'
  and exists (
    select 1
    from public.jobs j
    where j.id = job_stops.job_id
      and j.status <> 'tuhistatud'
  )
);

drop trigger if exists job_stops_updated_at on public.job_stops;
create trigger job_stops_updated_at
before update on public.job_stops
for each row execute function private.set_updated_at();

insert into public.settings(key, value)
values (
  'base_location',
  '{"label":"Luige","address":"Luige, Estonia"}'::jsonb
)
on conflict (key) do nothing;
