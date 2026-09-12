create or replace function public.add_job_stops(
  p_job_id uuid,
  p_stops jsonb,
  p_expected_revision bigint
)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_revision bigint;
  v_new_revision bigint;
  v_customer_id uuid;
  v_max_sequence integer;
  v_item jsonb;
  v_site_id uuid;
  v_site_name text;
  v_site_address text;
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
    and status not in ('tehtud', 'vajab_jareltegevust', 'tuhistatud')
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

    if v_site_id is not null then
      select name, address
        into v_site_name, v_site_address
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
      created_by
    ) values (
      p_job_id,
      v_site_id,
      v_max_sequence + v_ordinal,
      v_name,
      v_address,
      v_description,
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
$$;

create or replace function public.reorder_job_stops(
  p_job_id uuid,
  p_stop_ids uuid[],
  p_expected_revision bigint
)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
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
    and status not in ('tehtud', 'vajab_jareltegevust', 'tuhistatud')
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
$$;

create or replace function public.update_job_route_endpoints(
  p_job_id uuid,
  p_start_site_id uuid,
  p_start_address text,
  p_end_site_id uuid,
  p_end_address text,
  p_expected_revision bigint
)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
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
    and status not in ('tehtud', 'vajab_jareltegevust', 'tuhistatud')
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
$$;

create or replace function public.start_job_stop(p_stop_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_job_id uuid;
  v_new_revision bigint;
begin
  select s.job_id
    into v_job_id
  from public.job_stops s
  join public.jobs j on j.id = s.job_id
  where s.id = p_stop_id
    and s.status = 'pending'
    and j.operator_id = auth.uid()
    and j.status = 'toob'
    and j.actual_start is not null
  for update of s, j;

  if not found then
    raise exception 'stop cannot be started';
  end if;

  if exists (
    select 1 from public.job_stops
    where job_id = v_job_id and status = 'in_progress' and id <> p_stop_id
  ) then
    raise exception 'another stop is already in progress';
  end if;

  update public.job_stops
  set status = 'in_progress', actual_start = now()
  where id = p_stop_id
    and job_id = v_job_id
    and status = 'pending';

  update public.jobs
  set route_revision = route_revision + 1
  where id = v_job_id
  returning route_revision into v_new_revision;

  insert into public.job_events(job_id, actor_id, event_type, payload)
  values (
    v_job_id,
    auth.uid(),
    'stop_started',
    jsonb_build_object('stop_id', p_stop_id, 'revision', v_new_revision)
  );

  return v_new_revision;
end;
$$;

create or replace function public.complete_job_stop(
  p_stop_id uuid,
  p_note text
)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_job_id uuid;
  v_new_revision bigint;
begin
  if nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'completion note required';
  end if;

  select s.job_id
    into v_job_id
  from public.job_stops s
  join public.jobs j on j.id = s.job_id
  where s.id = p_stop_id
    and s.status = 'in_progress'
    and j.operator_id = auth.uid()
    and j.status = 'toob'
    and j.actual_start is not null
  for update of s, j;

  if not found then
    raise exception 'stop cannot be completed';
  end if;

  if not exists (
    select 1
    from public.job_photos p
    where p.job_id = v_job_id
      and p.job_stop_id = p_stop_id
  ) then
    raise exception 'stop photo required';
  end if;

  update public.job_stops
  set status = 'done',
      actual_end = now(),
      completion_note = btrim(p_note),
      completed_by = auth.uid()
  where id = p_stop_id
    and job_id = v_job_id
    and status = 'in_progress';

  update public.jobs
  set route_revision = route_revision + 1
  where id = v_job_id
  returning route_revision into v_new_revision;

  insert into public.job_events(job_id, actor_id, event_type, payload)
  values (
    v_job_id,
    auth.uid(),
    'stop_completed',
    jsonb_build_object('stop_id', p_stop_id, 'revision', v_new_revision)
  );

  return v_new_revision;
end;
$$;

create or replace function public.skip_job_stop(
  p_stop_id uuid,
  p_note text
)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_job_id uuid;
  v_new_revision bigint;
begin
  if nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'completion note required';
  end if;

  select s.job_id
    into v_job_id
  from public.job_stops s
  join public.jobs j on j.id = s.job_id
  where s.id = p_stop_id
    and s.status in ('pending', 'in_progress')
    and j.operator_id = auth.uid()
    and j.status = 'toob'
    and j.actual_start is not null
  for update of s, j;

  if not found then
    raise exception 'stop cannot be skipped';
  end if;

  update public.job_stops
  set status = 'skipped',
      actual_end = now(),
      completion_note = btrim(p_note),
      completed_by = auth.uid()
  where id = p_stop_id
    and job_id = v_job_id
    and status in ('pending', 'in_progress');

  update public.jobs
  set route_revision = route_revision + 1
  where id = v_job_id
  returning route_revision into v_new_revision;

  insert into public.job_events(job_id, actor_id, event_type, payload)
  values (
    v_job_id,
    auth.uid(),
    'stop_skipped',
    jsonb_build_object('stop_id', p_stop_id, 'revision', v_new_revision)
  );

  return v_new_revision;
end;
$$;

revoke all on function public.add_job_stops(uuid, jsonb, bigint) from public;
revoke all on function public.reorder_job_stops(uuid, uuid[], bigint) from public;
revoke all on function public.update_job_route_endpoints(uuid, uuid, text, uuid, text, bigint) from public;
revoke all on function public.start_job_stop(uuid) from public;
revoke all on function public.complete_job_stop(uuid, text) from public;
revoke all on function public.skip_job_stop(uuid, text) from public;

grant execute on function public.add_job_stops(uuid, jsonb, bigint) to authenticated;
grant execute on function public.reorder_job_stops(uuid, uuid[], bigint) to authenticated;
grant execute on function public.update_job_route_endpoints(uuid, uuid, text, uuid, text, bigint) to authenticated;
grant execute on function public.start_job_stop(uuid) to authenticated;
grant execute on function public.complete_job_stop(uuid, text) to authenticated;
grant execute on function public.skip_job_stop(uuid, text) to authenticated;
