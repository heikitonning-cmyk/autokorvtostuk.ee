alter table public.customer_sites
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geocoded_at timestamptz,
  add column if not exists geocode_source text,
  add column if not exists geocode_address_snapshot text;

alter table public.job_stops
  add column if not exists latitude_snapshot double precision,
  add column if not exists longitude_snapshot double precision;

create table if not exists public.geocode_cache (
  normalized_address text primary key,
  address_snapshot text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  source text not null,
  geocoded_at timestamptz not null default now()
);

alter table public.geocode_cache enable row level security;
revoke all on table public.geocode_cache from public;
revoke all on table public.geocode_cache from anon;
revoke all on table public.geocode_cache from authenticated;

create or replace function private.invalidate_customer_site_geocode()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
begin
  if new.address is distinct from old.address then
    new.latitude := null;
    new.longitude := null;
    new.geocoded_at := null;
    new.geocode_source := null;
    new.geocode_address_snapshot := null;
  end if;
  return new;
end;
$$;

drop trigger if exists customer_sites_invalidate_geocode on public.customer_sites;
create trigger customer_sites_invalidate_geocode
before update of address on public.customer_sites
for each row execute function private.invalidate_customer_site_geocode();

create or replace function public.get_cached_geocode(p_normalized_address text)
returns table(latitude double precision, longitude double precision)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if private.current_app_role() not in ('operator', 'manager') then
    raise exception 'not allowed';
  end if;

  if nullif(btrim(coalesce(p_normalized_address, '')), '') is null then
    return;
  end if;

  return query
  select gc.latitude, gc.longitude
  from public.geocode_cache gc
  where gc.normalized_address = btrim(p_normalized_address)
  limit 1;
end;
$$;

create or replace function public.save_geocode_result(
  p_normalized_address text,
  p_address_snapshot text,
  p_latitude double precision,
  p_longitude double precision,
  p_site_id uuid default null,
  p_stop_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_key text := nullif(btrim(coalesce(p_normalized_address, '')), '');
  v_address text := nullif(btrim(coalesce(p_address_snapshot, '')), '');
begin
  if private.current_app_role() not in ('operator', 'manager') then
    raise exception 'not allowed';
  end if;

  if v_key is null or v_address is null then
    raise exception 'address required';
  end if;

  if p_latitude is null or p_latitude not between -90 and 90
     or p_longitude is null or p_longitude not between -180 and 180 then
    raise exception 'invalid coordinates';
  end if;

  insert into public.geocode_cache(
    normalized_address,
    address_snapshot,
    latitude,
    longitude,
    source,
    geocoded_at
  ) values (
    v_key,
    v_address,
    p_latitude,
    p_longitude,
    'nominatim',
    now()
  )
  on conflict (normalized_address) do update
  set address_snapshot = excluded.address_snapshot,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      source = excluded.source,
      geocoded_at = excluded.geocoded_at;

  if p_site_id is not null then
    update public.customer_sites
    set latitude = p_latitude,
        longitude = p_longitude,
        geocoded_at = now(),
        geocode_source = 'nominatim',
        geocode_address_snapshot = address
    where id = p_site_id
      and active = true;

    if not found then
      raise exception 'invalid customer site';
    end if;
  end if;

  if p_stop_id is not null then
    update public.job_stops
    set latitude_snapshot = p_latitude,
        longitude_snapshot = p_longitude
    where id = p_stop_id;

    if not found then
      raise exception 'invalid job stop';
    end if;
  end if;
end;
$$;

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
$$;

revoke all on function public.get_cached_geocode(text) from public;
revoke all on function public.save_geocode_result(text, text, double precision, double precision, uuid, uuid) from public;
revoke all on function public.add_job_stops(uuid, jsonb, bigint) from public;

grant execute on function public.get_cached_geocode(text) to authenticated;
grant execute on function public.save_geocode_result(text, text, double precision, double precision, uuid, uuid) to authenticated;
grant execute on function public.add_job_stops(uuid, jsonb, bigint) to authenticated;
