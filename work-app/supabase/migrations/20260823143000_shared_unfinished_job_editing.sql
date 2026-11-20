-- Every active manager/operator may edit planning details for any unfinished,
-- non-cancelled job. Ownership/status transitions remain protected separately.

drop policy if exists "operator can read free or own jobs" on public.jobs;
drop policy if exists "operator can read all non-cancelled jobs" on public.jobs;
create policy "operator can read all non-cancelled jobs" on public.jobs
for select to authenticated using (
  private.current_app_role() = 'operator'
  and status <> 'tuhistatud'
);

drop policy if exists "operator can read visible customers" on public.customers;
drop policy if exists "operator can read all customers" on public.customers;
create policy "operator can read all customers" on public.customers
for select to authenticated using (
  private.current_app_role() = 'operator'
);

drop policy if exists "operator can read pricing settings" on public.settings;
create policy "operator can read pricing settings" on public.settings
for select to authenticated using (
  private.current_app_role() = 'operator'
  and key = 'pricing'
);

-- Keep the single-lift shared plan complete: fully unscheduled jobs are visible too.
create or replace function public.shared_lift_calendar()
returns table (
  id uuid,
  customer_name text,
  work_type_name text,
  object_name text,
  address text,
  description text,
  status text,
  planned_date date,
  planned_time time,
  planned_end_time time,
  start_planned timestamptz,
  end_planned timestamptz,
  is_free boolean,
  is_mine boolean
)
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
begin
  if auth.uid() is null or private.current_app_role() not in ('operator', 'manager') then
    raise exception 'Kasutajal puudub õigus kalendrit vaadata.' using errcode = 'P0001';
  end if;

  return query
  select
    j.id,
    c.name as customer_name,
    wt.name as work_type_name,
    j.object_name,
    j.address,
    j.description,
    j.status,
    j.planned_date,
    j.planned_time,
    j.planned_end_time,
    j.start_planned,
    j.end_planned,
    j.operator_id is null as is_free,
    j.operator_id = auth.uid() as is_mine
  from public.jobs j
  left join public.customers c on c.id = j.customer_id
  left join public.work_types wt on wt.id = j.work_type_id
  where j.status <> 'tuhistatud'
    and (
      j.start_planned between now() - interval '2 days' and now() + interval '35 days'
      or j.planned_date between (timezone('Europe/Tallinn', now())::date - 2)
        and (timezone('Europe/Tallinn', now())::date + 35)
      or (j.start_planned is null and j.planned_date is null)
    )
  order by
    coalesce(j.start_planned, j.planned_date::timestamp at time zone 'Europe/Tallinn') asc nulls last,
    j.planned_time asc nulls last,
    j.created_at asc;
end;
$$;

create or replace function public.update_editable_job(
  p_job_id uuid,
  p_customer_id uuid,
  p_vehicle_id uuid,
  p_planned_date date,
  p_planned_time time,
  p_planned_end_time time,
  p_address text,
  p_object_name text,
  p_work_type_id uuid,
  p_description text,
  p_access_notes text,
  p_estimated_hours numeric,
  p_estimated_drive_hours numeric,
  p_estimated_km numeric,
  p_estimated_helper_hours numeric,
  p_manual_adjustment numeric,
  p_manual_adjustment_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_job public.jobs%rowtype;
  v_rates jsonb;
  v_hourly_rate numeric;
  v_minimum_order numeric;
  v_drive_hourly_rate numeric;
  v_km_rate numeric;
  v_helper_hourly_rate numeric;
  v_lift numeric;
  v_drive numeric;
  v_distance numeric;
  v_helper numeric;
  v_adjustment numeric;
  v_subtotal numeric;
  v_total numeric;
  v_job_id uuid;
begin
  if auth.uid() is null or private.current_app_role() not in ('operator', 'manager') then
    raise exception 'Kasutajal puudub õigus tööd muuta.' using errcode = 'P0001';
  end if;

  select * into v_job
  from public.jobs
  where id = p_job_id
  for update;

  if v_job.id is null then
    raise exception 'Tööd ei leitud.' using errcode = 'P0001';
  end if;

  if v_job.status in ('tehtud', 'vajab_jareltegevust', 'tuhistatud') then
    raise exception 'Lõpetatud või tühistatud tööd ei saa muuta.' using errcode = 'P0001';
  end if;

  if v_job.price_snapshot_json is not null then
    v_rates := v_job.price_snapshot_json;
  else
    select value into v_rates from public.settings where key = 'pricing';
  end if;
  v_rates := coalesce(v_rates, '{}'::jsonb);

  v_hourly_rate := coalesce((v_rates->>'hourlyRate')::numeric, 45);
  v_minimum_order := coalesce((v_rates->>'minimumOrder')::numeric, 90);
  v_drive_hourly_rate := coalesce((v_rates->>'driveHourlyRate')::numeric, 45);
  v_km_rate := coalesce((v_rates->>'kmRate')::numeric, 1);
  v_helper_hourly_rate := coalesce((v_rates->>'helperHourlyRate')::numeric, 35);

  v_lift := round(greatest(0, coalesce(p_estimated_hours, 0)) * v_hourly_rate, 2);
  v_drive := round(greatest(0, coalesce(p_estimated_drive_hours, 0)) * v_drive_hourly_rate, 2);
  v_distance := round(greatest(0, coalesce(p_estimated_km, 0)) * v_km_rate, 2);
  v_helper := round(greatest(0, coalesce(p_estimated_helper_hours, 0)) * v_helper_hourly_rate, 2);
  v_adjustment := round(coalesce(p_manual_adjustment, 0), 2);
  v_subtotal := round(v_lift + v_drive + v_distance + v_helper + v_adjustment, 2);
  v_total := round(greatest(v_minimum_order, v_subtotal), 2);

  update public.jobs
  set
    customer_id = p_customer_id,
    vehicle_id = p_vehicle_id,
    planned_date = p_planned_date,
    planned_time = p_planned_time,
    planned_end_time = p_planned_end_time,
    start_planned = case
      when p_planned_date is not null and p_planned_time is not null
        then (p_planned_date + p_planned_time) at time zone 'Europe/Tallinn'
      else null
    end,
    end_planned = case
      when p_planned_date is not null and p_planned_end_time is not null
        then (p_planned_date + p_planned_end_time) at time zone 'Europe/Tallinn'
      else null
    end,
    address = nullif(trim(coalesce(p_address, '')), ''),
    object_name = nullif(trim(coalesce(p_object_name, '')), ''),
    work_type_id = p_work_type_id,
    description = nullif(trim(coalesce(p_description, '')), ''),
    access_notes = nullif(trim(coalesce(p_access_notes, '')), ''),
    estimated_total = v_total,
    estimated_hours = greatest(0, coalesce(p_estimated_hours, 0)),
    estimated_drive_hours = greatest(0, coalesce(p_estimated_drive_hours, 0)),
    estimated_km = greatest(0, coalesce(p_estimated_km, 0)),
    estimated_helper_hours = greatest(0, coalesce(p_estimated_helper_hours, 0)),
    manual_adjustment = coalesce(p_manual_adjustment, 0),
    manual_adjustment_reason = nullif(trim(coalesce(p_manual_adjustment_reason, '')), ''),
    helper_used = coalesce(p_estimated_helper_hours, 0) > 0
  where id = p_job_id
    and status not in ('tehtud', 'vajab_jareltegevust', 'tuhistatud')
  returning id into v_job_id;

  if v_job_id is null then
    raise exception 'Tööd ei saa enam muuta.' using errcode = 'P0001';
  end if;

  return v_job_id;
end;
$$;

revoke all on function public.update_editable_job(uuid,uuid,uuid,date,time,time,text,text,uuid,text,text,numeric,numeric,numeric,numeric,numeric,text) from public, anon;
grant execute on function public.update_editable_job(uuid,uuid,uuid,date,time,time,text,text,uuid,text,text,numeric,numeric,numeric,numeric,numeric,text) to authenticated;
