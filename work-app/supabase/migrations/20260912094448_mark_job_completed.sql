-- Extend completion without rewriting existing jobs or the legacy finish/billing flow.
alter table public.jobs add column if not exists completed_at timestamptz;
alter table public.jobs drop constraint jobs_status_check;
alter table public.jobs add constraint jobs_status_check
  check (status in ('uus','kinnitatud','teel','toob','tehtud','completed','vajab_jareltegevust','tuhistatud'));

create or replace function public.mark_job_completed(p_job_id uuid, p_completed_at timestamptz)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_job public.jobs%rowtype;
begin
  select u.role into v_role from public.users u where u.id = v_user_id and u.active;
  if v_user_id is null or v_role is null or v_role not in ('manager','operator') then
    raise exception 'Completion not permitted' using errcode = '42501';
  end if;
  if p_completed_at is null or not isfinite(p_completed_at) or p_completed_at > clock_timestamp() then
    raise exception 'Invalid completion time' using errcode = '22023';
  end if;
  select * into v_job from public.jobs
  where id = p_job_id and (v_role = 'manager' or operator_id = v_user_id)
  for update;
  if not found then
    raise exception 'Completion not permitted' using errcode = '42501';
  end if;
  -- A repeated request must preserve the first completion time and audit event.
  if v_job.status = 'completed' then return v_job.id; end if;
  if v_job.status not in ('uus','kinnitatud','teel','toob') then
    raise exception 'Job is no longer active' using errcode = '22023';
  end if;
  update public.jobs set status = 'completed', completed_at = p_completed_at
  where id = v_job.id;
  return v_job.id;
end;
$function$;
revoke all on function public.mark_job_completed(uuid,timestamptz) from public, anon, service_role;
grant execute on function public.mark_job_completed(uuid,timestamptz) to authenticated;

-- Existing planning mutations must regard the new status as locked, like tehtud.

CREATE OR REPLACE FUNCTION public.release_job(p_job_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_job_id uuid;
begin
  if auth.uid() is null or private.current_app_role() not in ('operator', 'manager') then
    raise exception 'Kasutajal puudub õigus tööd vabastada.' using errcode = 'P0001';
  end if;

  update public.jobs
  set operator_id = null
  where id = p_job_id
    and operator_id = auth.uid()
    and actual_start is null
    and status not in ('toob', 'completed', 'tehtud', 'vajab_jareltegevust', 'tuhistatud')
  returning id into v_job_id;

  if v_job_id is null then
    raise exception 'Tööd ei saa vabastada: töö on juba alustatud või see ei kuulu sulle.' using errcode = 'P0001';
  end if;

  return v_job_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_editable_job(p_job_id uuid, p_customer_id uuid, p_site_id uuid, p_vehicle_id uuid, p_planned_date date, p_planned_time time without time zone, p_planned_end_time time without time zone, p_address text, p_object_name text, p_work_type_id uuid, p_description text, p_access_notes text, p_estimated_hours numeric, p_estimated_drive_hours numeric, p_estimated_km numeric, p_estimated_helper_hours numeric, p_manual_adjustment numeric, p_manual_adjustment_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
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

  if v_job.status in ('completed', 'tehtud', 'vajab_jareltegevust', 'tuhistatud') then
    raise exception 'Lõpetatud või tühistatud tööd ei saa muuta.' using errcode = 'P0001';
  end if;

  if p_site_id is not null and (
    p_customer_id is null
    or not exists (
      select 1 from public.customer_sites s
      where s.id = p_site_id and s.customer_id = p_customer_id and s.active = true
    )
  ) then
    raise exception 'Valitud asukoht ei kuulu valitud kliendile.' using errcode = 'P0001';
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
    site_id = p_site_id,
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
    and status not in ('completed', 'tehtud', 'vajab_jareltegevust', 'tuhistatud')
  returning id into v_job_id;

  if v_job_id is null then
    raise exception 'Tööd ei saa enam muuta.' using errcode = 'P0001';
  end if;

  return v_job_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reorder_job_stops(p_job_id uuid, p_stop_ids uuid[], p_expected_revision bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_revision bigint;
  v_new_revision bigint;
  v_pending_count integer;
  v_distinct_count integer;
  v_slots integer[];
  v_stop_id uuid;
  v_index integer;
begin
  if private.current_app_role() not in ('operator', 'manager') then
    raise exception 'not allowed';
  end if;

  select route_revision
    into v_revision
  from public.jobs
  where id = p_job_id
    and status not in ('completed', 'tehtud', 'vajab_jareltegevust', 'tuhistatud')
    and route_revision = p_expected_revision
  for update;

  if not found then
    raise exception 'stale route revision';
  end if;

  select count(*), array_agg(sequence_no order by sequence_no)
    into v_pending_count, v_slots
  from public.job_stops
  where job_id = p_job_id
    and status = 'pending';

  select count(distinct x)
    into v_distinct_count
  from unnest(coalesce(p_stop_ids, array[]::uuid[])) as x;

  if coalesce(array_length(p_stop_ids, 1), 0) <> v_pending_count
     or v_distinct_count <> v_pending_count
     or exists (
       select 1
       from unnest(coalesce(p_stop_ids, array[]::uuid[])) as x
       where not exists (
         select 1 from public.job_stops s
         where s.id = x and s.job_id = p_job_id and s.status = 'pending'
       )
     ) then
    raise exception 'invalid pending stop set';
  end if;

  if v_pending_count > 0 then
    update public.job_stops
    set sequence_no = sequence_no + 1000000
    where job_id = p_job_id
      and status = 'pending';

    for v_index in 1..array_length(p_stop_ids, 1)
    loop
      v_stop_id := p_stop_ids[v_index];
      update public.job_stops
      set sequence_no = v_slots[v_index]
      where id = v_stop_id
        and job_id = p_job_id
        and status = 'pending';
    end loop;
  end if;

  update public.jobs
  set route_revision = route_revision + 1
  where id = p_job_id
  returning route_revision into v_new_revision;

  insert into public.job_events(job_id, actor_id, event_type, payload)
  values (
    p_job_id,
    auth.uid(),
    'stops_reordered',
    jsonb_build_object('stop_ids', to_jsonb(p_stop_ids), 'revision', v_new_revision)
  );

  return v_new_revision;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_job_route_endpoints(p_job_id uuid, p_start_site_id uuid, p_start_address text, p_end_site_id uuid, p_end_address text, p_expected_revision bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_revision bigint;
  v_new_revision bigint;
  v_start_address text;
  v_end_address text;
begin
  if private.current_app_role() not in ('operator', 'manager') then
    raise exception 'not allowed';
  end if;

  select route_revision
    into v_revision
  from public.jobs
  where id = p_job_id
    and status not in ('completed', 'tehtud', 'vajab_jareltegevust', 'tuhistatud')
    and route_revision = p_expected_revision
  for update;

  if not found then
    raise exception 'stale route revision';
  end if;

  if p_start_site_id is not null then
    select nullif(btrim(coalesce(address, '')), '')
      into v_start_address
    from public.customer_sites
    where id = p_start_site_id and active = true;
    if v_start_address is null then
      raise exception 'invalid start site';
    end if;
  else
    v_start_address := nullif(btrim(coalesce(p_start_address, '')), '');
  end if;

  if p_end_site_id is not null then
    select nullif(btrim(coalesce(address, '')), '')
      into v_end_address
    from public.customer_sites
    where id = p_end_site_id and active = true;
    if v_end_address is null then
      raise exception 'invalid end site';
    end if;
  else
    v_end_address := nullif(btrim(coalesce(p_end_address, '')), '');
  end if;

  update public.jobs
  set route_start_site_id = p_start_site_id,
      route_start_address = v_start_address,
      route_end_site_id = p_end_site_id,
      route_end_address = v_end_address,
      route_revision = route_revision + 1
  where id = p_job_id
  returning route_revision into v_new_revision;

  insert into public.job_events(job_id, actor_id, event_type, payload)
  values (
    p_job_id,
    auth.uid(),
    'route_endpoints_changed',
    jsonb_build_object(
      'start_site_id', p_start_site_id,
      'start_address', v_start_address,
      'end_site_id', p_end_site_id,
      'end_address', v_end_address,
      'revision', v_new_revision
    )
  );

  return v_new_revision;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_job_stop_description(p_stop_id uuid, p_description text, p_expected_revision bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_job_id uuid;
  v_old_description text;
  v_new_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_new_revision bigint;
begin
  if private.current_app_role() not in ('operator', 'manager') then
    raise exception 'not allowed';
  end if;

  select s.job_id, s.description
    into v_job_id, v_old_description
  from public.job_stops s
  join public.jobs j on j.id = s.job_id
  where s.id = p_stop_id
    and s.status = 'pending'
    and j.status not in ('completed', 'tehtud', 'vajab_jareltegevust', 'tuhistatud')
    and j.route_revision = p_expected_revision
  for update of s, j;

  if not found then
    raise exception 'stale route revision';
  end if;

  update public.job_stops
  set description = v_new_description
  where id = p_stop_id and job_id = v_job_id and status = 'pending';

  update public.jobs
  set route_revision = route_revision + 1
  where id = v_job_id
  returning route_revision into v_new_revision;

  insert into public.job_events(job_id, actor_id, event_type, payload)
  values (
    v_job_id,
    auth.uid(),
    'stop_description_changed',
    jsonb_build_object(
      'stop_id', p_stop_id,
      'old_description', v_old_description,
      'new_description', v_new_description,
      'revision', v_new_revision
    )
  );

  return v_new_revision;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.add_job_stops(p_job_id uuid, p_stops jsonb, p_expected_revision bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_revision bigint;
  v_new_revision bigint;
  v_customer_id uuid;
  v_max_sequence integer;
  v_item jsonb;
  v_site_id uuid;
  v_site_name text;
  v_site_address text;
  v_site_latitude double precision;
  v_site_longitude double precision;
  v_name text;
  v_address text;
  v_description text;
  v_ordinal integer := 0;
begin
  if private.current_app_role() not in ('operator', 'manager') then
    raise exception 'not allowed';
  end if;

  select route_revision, customer_id
    into v_revision, v_customer_id
  from public.jobs
  where id = p_job_id
    and status not in ('completed', 'tehtud', 'vajab_jareltegevust', 'tuhistatud')
    and route_revision = p_expected_revision
  for update;

  if not found then
    raise exception 'stale route revision';
  end if;

  if p_stops is null or jsonb_typeof(p_stops) <> 'array' or jsonb_array_length(p_stops) = 0 then
    raise exception 'stops required';
  end if;

  select coalesce(max(sequence_no), 0)
    into v_max_sequence
  from public.job_stops
  where job_id = p_job_id;

  for v_item in select value from jsonb_array_elements(p_stops)
  loop
    v_ordinal := v_ordinal + 1;
    v_site_id := nullif(v_item->>'siteId', '')::uuid;
    v_description := nullif(btrim(coalesce(v_item->>'description', '')), '');
    v_site_latitude := null;
    v_site_longitude := null;

    if v_site_id is not null then
      select
        name,
        address,
        case when geocode_address_snapshot is not distinct from address then latitude else null end,
        case when geocode_address_snapshot is not distinct from address then longitude else null end
        into v_site_name, v_site_address, v_site_latitude, v_site_longitude
      from public.customer_sites
      where id = v_site_id
        and customer_id is not distinct from v_customer_id
        and active = true;

      if not found then
        raise exception 'invalid customer site';
      end if;

      v_name := v_site_name;
      v_address := nullif(btrim(coalesce(v_site_address, '')), '');
    else
      v_name := nullif(btrim(coalesce(v_item->>'name', '')), '');
      v_address := nullif(btrim(coalesce(v_item->>'address', '')), '');
    end if;

    if v_address is null then
      raise exception 'stop address required';
    end if;

    if v_name is null then
      v_name := v_address;
    end if;

    insert into public.job_stops(
      job_id,
      site_id,
      sequence_no,
      name_snapshot,
      address_snapshot,
      description,
      latitude_snapshot,
      longitude_snapshot,
      created_by
    ) values (
      p_job_id,
      v_site_id,
      v_max_sequence + v_ordinal,
      v_name,
      v_address,
      v_description,
      v_site_latitude,
      v_site_longitude,
      auth.uid()
    );
  end loop;

  update public.jobs
  set route_revision = route_revision + 1
  where id = p_job_id
  returning route_revision into v_new_revision;

  insert into public.job_events(job_id, actor_id, event_type, payload)
  values (
    p_job_id,
    auth.uid(),
    'stops_added',
    jsonb_build_object('count', v_ordinal, 'revision', v_new_revision)
  );

  return v_new_revision;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.remove_job_stop(p_job_id uuid, p_stop_id uuid, p_expected_revision bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_revision bigint;
  v_new_revision bigint;
  v_sequence integer;
  v_stop record;
  v_index integer := 0;
begin
  if private.current_app_role() not in ('operator', 'manager') then
    raise exception 'not allowed';
  end if;

  select route_revision
    into v_revision
  from public.jobs
  where id = p_job_id
    and status not in ('completed', 'tehtud', 'vajab_jareltegevust', 'tuhistatud')
    and route_revision = p_expected_revision
  for update;

  if not found then
    raise exception 'stale route revision';
  end if;

  delete from public.job_stops
  where id = p_stop_id
    and job_id = p_job_id
    and status = 'pending'
  returning sequence_no into v_sequence;

  if not found then
    raise exception 'stop cannot be removed';
  end if;

  update public.job_stops
  set sequence_no = sequence_no + 1000000
  where job_id = p_job_id;

  for v_stop in
    select id
    from public.job_stops
    where job_id = p_job_id
    order by sequence_no
  loop
    v_index := v_index + 1;
    update public.job_stops
    set sequence_no = v_index
    where id = v_stop.id;
  end loop;

  update public.jobs
  set route_revision = route_revision + 1
  where id = p_job_id
  returning route_revision into v_new_revision;

  insert into public.job_events(job_id, actor_id, event_type, payload)
  values (
    p_job_id,
    auth.uid(),
    'stop_removed',
    jsonb_build_object('stop_id', p_stop_id, 'sequence_no', v_sequence, 'revision', v_new_revision)
  );

  return v_new_revision;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_job(p_job_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_job_id uuid;
begin
  if auth.uid() is null or private.current_app_role() not in ('operator', 'manager') then
    raise exception 'Kasutajal puudub õigus tööd võtta.' using errcode = 'P0001';
  end if;

  update public.jobs
  set operator_id = auth.uid()
  where id = p_job_id
    and operator_id is null
    and status not in ('completed', 'tehtud', 'vajab_jareltegevust', 'tuhistatud')
  returning id into v_job_id;

  if v_job_id is null then
    raise exception 'Keegi teine jõudis selle töö juba võtta.' using errcode = 'P0001';
  end if;

  return v_job_id;
end;
$function$
;
