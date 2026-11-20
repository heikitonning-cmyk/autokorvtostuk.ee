alter table public.jobs
  add column if not exists source text,
  add column if not exists external_ref text;

create unique index if not exists jobs_source_external_ref_uidx
  on public.jobs (source, external_ref)
  where source is not null and external_ref is not null;
