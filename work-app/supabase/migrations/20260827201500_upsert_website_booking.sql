create or replace function public.upsert_website_booking(
  p_external_ref text,
  p_planned_date date,
  p_planned_time time without time zone default null,
  p_object_name text default null,
  p_address text default null,
  p_description text default null,
  p_estimated_hours numeric default 2,
  p_estimated_total numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_external_ref text := upper(btrim(p_external_ref));
  v_job_id uuid;
  v_start_planned timestamptz;
begin
  if v_external_ref !~ '^AT-\d+$' then
    raise exception 'invalid external reference: %', p_external_ref using errcode = '22023';
  end if;

  if p_planned_date is null then
    raise exception 'planned date is required' using errcode = '22023';
  end if;

  if coalesce(p_estimated_hours, 2) <= 0 then
    raise exception 'estimated hours must be positive' using errcode = '22023';
  end if;

  if p_estimated_total is not null and p_estimated_total < 0 then
    raise exception 'estimated total must be non-negative' using errcode = '22023';
  end if;

  if p_planned_time is not null then
    v_start_planned := (p_planned_date + p_planned_time) at time zone 'Europe/Tallinn';
  end if;

  insert into public.jobs (
    source,
    external_ref,
    status,
    planned_date,
    planned_time,
    start_planned,
    object_name,
    address,
    description,
    estimated_hours,
    estimated_total,
    operator_id
  ) values (
    'website',
    v_external_ref,
    'kinnitatud',
    p_planned_date,
    p_planned_time,
    v_start_planned,
    nullif(btrim(p_object_name), ''),
    nullif(btrim(p_address), ''),
    nullif(btrim(p_description), ''),
    coalesce(p_estimated_hours, 2),
    p_estimated_total,
    null
  )
  on conflict (source, external_ref)
    where source is not null and external_ref is not null
  do update set
    status = 'kinnitatud',
    planned_date = excluded.planned_date,
    planned_time = excluded.planned_time,
    start_planned = excluded.start_planned,
    object_name = coalesce(excluded.object_name, public.jobs.object_name),
    address = coalesce(excluded.address, public.jobs.address),
    description = coalesce(excluded.description, public.jobs.description),
    estimated_hours = excluded.estimated_hours,
    estimated_total = coalesce(excluded.estimated_total, public.jobs.estimated_total),
    updated_at = now()
  returning id into v_job_id;

  return v_job_id;
end;
$$;

revoke all on function public.upsert_website_booking(text, date, time without time zone, text, text, text, numeric, numeric) from public;
revoke all on function public.upsert_website_booking(text, date, time without time zone, text, text, text, numeric, numeric) from anon;
revoke all on function public.upsert_website_booking(text, date, time without time zone, text, text, text, numeric, numeric) from authenticated;
