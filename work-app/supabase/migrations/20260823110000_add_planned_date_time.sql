alter table public.jobs
  add column if not exists planned_date date,
  add column if not exists planned_time time without time zone,
  add column if not exists planned_end_time time without time zone;

update public.jobs
set
  planned_date = coalesce(planned_date, (start_planned at time zone 'Europe/Tallinn')::date),
  planned_time = coalesce(planned_time, (start_planned at time zone 'Europe/Tallinn')::time(0)),
  planned_end_time = coalesce(planned_end_time, (end_planned at time zone 'Europe/Tallinn')::time(0))
where start_planned is not null or end_planned is not null;

create index if not exists jobs_planned_date_idx on public.jobs(planned_date);
