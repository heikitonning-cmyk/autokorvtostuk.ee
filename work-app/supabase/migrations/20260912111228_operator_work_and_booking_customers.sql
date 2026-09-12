-- Record the existing website integration as an additive prerequisite for fresh installs.
alter table public.jobs add column if not exists website_booking_details jsonb;
alter table public.jobs add column if not exists operator_does_work boolean;
alter table public.jobs add column if not exists operator_work_surcharge numeric(12,2);
alter table public.jobs add column if not exists extra_worker_count integer;
alter table public.jobs add column if not exists website_confirmation_email_id text;
alter table public.jobs add column if not exists website_confirmation_email_status text;
alter table public.jobs add column if not exists website_confirmation_email_event_at timestamptz;

CREATE OR REPLACE FUNCTION public.upsert_website_booking(p_external_ref text, p_planned_date date, p_planned_time time without time zone DEFAULT NULL::time without time zone, p_object_name text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_estimated_hours numeric DEFAULT 2, p_estimated_total numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_external_ref text := upper(btrim(p_external_ref));
  v_job_id uuid;
BEGIN
  IF v_external_ref IS NULL OR v_external_ref !~ '^AT-[0-9]+$' THEN
    RAISE EXCEPTION 'invalid external reference' USING errcode = '22023';
  END IF;
  IF p_planned_date IS NULL OR coalesce(p_estimated_hours, 2) <= 0
     OR coalesce(p_estimated_hours, 2)::text IN ('NaN','Infinity','-Infinity')
     OR p_estimated_total < 0 OR p_estimated_total::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'invalid booking values' USING errcode = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('website:' || v_external_ref, 0));
  SELECT id INTO v_job_id FROM public.jobs WHERE source = 'website' AND external_ref = v_external_ref;
  IF v_job_id IS NOT NULL THEN RETURN v_job_id; END IF;
  INSERT INTO public.jobs (source, external_ref, status, planned_date, planned_time,
    start_planned, object_name, address, description, estimated_hours, estimated_total, operator_id)
  VALUES ('website', v_external_ref, 'kinnitatud', p_planned_date, p_planned_time,
    CASE WHEN p_planned_time IS NOT NULL THEN (p_planned_date + p_planned_time) AT TIME ZONE 'Europe/Tallinn' END,
    nullif(btrim(p_object_name), ''), nullif(btrim(p_address), ''), nullif(btrim(p_description), ''),
    coalesce(p_estimated_hours, 2), p_estimated_total, NULL)
  ON CONFLICT (source, external_ref) WHERE source IS NOT NULL AND external_ref IS NOT NULL
  DO NOTHING RETURNING id INTO v_job_id;
  IF v_job_id IS NULL THEN
    SELECT id INTO v_job_id FROM public.jobs WHERE source = 'website' AND external_ref = v_external_ref;
  END IF;
  RETURN v_job_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_website_booking(p_external_ref text, p_planned_date date, p_planned_time time without time zone, p_object_name text, p_address text, p_description text, p_estimated_hours numeric, p_estimated_total numeric, p_details jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_ref text := upper(btrim(p_external_ref));
  v_id uuid;
  v_helpers integer := coalesce((p_details->>'extra_worker_count')::integer, 0);
  v_operator boolean := coalesce((p_details->>'operator_does_work')::boolean, false);
  v_fee numeric := coalesce((p_details->>'operator_work_surcharge')::numeric, 0);
BEGIN
  IF v_ref IS NULL OR v_ref !~ '^AT-[0-9]+$' OR jsonb_typeof(p_details) <> 'object'
     OR v_helpers < 0 OR v_helpers > 20 OR v_fee < 0 OR v_fee::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'invalid booking details' USING errcode = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('website:' || v_ref, 0));
  SELECT id INTO v_id FROM public.jobs WHERE source = 'website' AND external_ref = v_ref;
  -- Returning an existing job is deliberately a complete no-op, including updated_at.
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  -- Do not silently duplicate a probable manually entered booking.
  IF EXISTS (SELECT 1 FROM public.jobs WHERE source IS DISTINCT FROM 'website'
      AND planned_date = p_planned_date AND nullif(lower(btrim(address)), '') = nullif(lower(btrim(p_address)), '')
      AND (planned_time IS NULL OR p_planned_time IS NULL OR abs(extract(epoch FROM (planned_time - p_planned_time))) <= 1800)) THEN
    RAISE EXCEPTION 'possible_existing_manual_job_requires_review' USING errcode = '23505';
  END IF;
  v_id := public.upsert_website_booking(v_ref,p_planned_date,p_planned_time,p_object_name,p_address,p_description,p_estimated_hours,p_estimated_total);
  UPDATE public.jobs SET
    website_booking_details = p_details,
    operator_does_work = v_operator,
    operator_work_surcharge = v_fee,
    extra_worker_count = v_helpers,
    helper_used = v_helpers > 0,
    estimated_helper_hours = coalesce(p_estimated_hours,2) * v_helpers,
    estimated_km = greatest(0,coalesce((p_details->>'estimated_km')::numeric,0)),
    work_type_id = (SELECT id FROM public.work_types WHERE name = p_details->>'work_type' ORDER BY id LIMIT 1),
    website_confirmation_email_id = nullif(p_details->>'confirmation_email_id',''),
    website_confirmation_email_status = CASE WHEN p_details->>'confirmation_email_status' = 'sent' THEN 'sent' END,
    website_confirmation_email_event_at = (p_details->>'confirmation_email_sent_at')::timestamptz
  WHERE id = v_id;
  RETURN v_id;
END;
$function$
;

revoke all on function public.upsert_website_booking(text,date,time without time zone,text,text,text,numeric,numeric) from public, anon, authenticated;
grant execute on function public.upsert_website_booking(text,date,time without time zone,text,text,text,numeric,numeric) to service_role;

revoke all on function public.upsert_website_booking(text,date,time without time zone,text,text,text,numeric,numeric,jsonb) from public, anon, authenticated;
grant execute on function public.upsert_website_booking(text,date,time without time zone,text,text,text,numeric,numeric,jsonb) to service_role;

-- Add optional operator labour without changing existing job totals or minimums.
grant usage on schema private to service_role;
alter table public.jobs add column if not exists operator_work_hourly_rate numeric
  check (operator_work_hourly_rate >= 0 and operator_work_hourly_rate::text not in ('NaN','Infinity','-Infinity'));
alter table public.jobs add column if not exists actual_operator_work_hours numeric
  check (actual_operator_work_hours >= 0 and actual_operator_work_hours::text not in ('NaN','Infinity','-Infinity'));
alter table public.jobs add column if not exists actual_operator_work_surcharge numeric
  check (actual_operator_work_surcharge >= 0 and actual_operator_work_surcharge::text not in ('NaN','Infinity','-Infinity'));
update public.settings set value=value || '{"operatorWorkHourlyRate":15}'::jsonb
where key='pricing' and not (value ? 'operatorWorkHourlyRate');

CREATE OR REPLACE FUNCTION private.update_editable_job_pricing(p_job_id uuid, p_customer_id uuid, p_site_id uuid, p_vehicle_id uuid, p_planned_date date, p_planned_time time without time zone, p_planned_end_time time without time zone, p_address text, p_object_name text, p_work_type_id uuid, p_description text, p_access_notes text, p_estimated_hours numeric, p_estimated_drive_hours numeric, p_estimated_km numeric, p_estimated_helper_hours numeric, p_manual_adjustment numeric, p_manual_adjustment_reason text, p_operator_does_work boolean)
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
  v_operator boolean;
  v_operator_rate numeric;
  v_operator_fee numeric;
begin
  if auth.uid() is null or not exists (select 1 from public.users where id=auth.uid() and active and role in ('operator','manager')) then
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

  v_operator := coalesce(p_operator_does_work, v_job.operator_does_work, false);
  v_operator_rate := coalesce(v_job.operator_work_hourly_rate, (v_job.price_snapshot_json->>'operatorWorkHourlyRate')::numeric,
    case when v_job.operator_does_work and v_job.estimated_hours > 0 then v_job.operator_work_surcharge / v_job.estimated_hours end,
    case when v_job.source='website' or v_job.price_snapshot_json is not null then 15 else (v_rates->>'operatorWorkHourlyRate')::numeric end, 15);
  v_operator_fee := case when v_operator then round(greatest(0,coalesce(p_estimated_hours,0)) * v_operator_rate,2) else 0 end;

  if exists (select 1 from unnest(array[p_estimated_hours,p_estimated_drive_hours,p_estimated_km,p_estimated_helper_hours,p_manual_adjustment]) n
    where n::text in ('NaN','Infinity','-Infinity')) then
    raise exception 'Vigane arvuline väärtus.' using errcode='22023';
  end if;

  v_lift := round(greatest(0, coalesce(p_estimated_hours, 0)) * v_hourly_rate, 2);
  v_drive := round(greatest(0, coalesce(p_estimated_drive_hours, 0)) * v_drive_hourly_rate, 2);
  v_distance := round(greatest(0, coalesce(p_estimated_km, 0)) * v_km_rate, 2);
  v_helper := round(greatest(0, coalesce(p_estimated_helper_hours, 0)) * v_helper_hourly_rate, 2);
  v_adjustment := round(coalesce(p_manual_adjustment, 0), 2);
  v_subtotal := round(v_lift + v_drive + v_distance + v_helper + v_adjustment, 2);
  v_total := round(greatest(v_minimum_order, v_subtotal) + v_operator_fee, 2);
  -- Keep an agreed base quote when changing contacts or just optional operator labour.
  if v_job.estimated_total is not null
     and coalesce(p_estimated_hours,0)=coalesce(v_job.estimated_hours,0)
     and coalesce(p_estimated_drive_hours,0)=coalesce(v_job.estimated_drive_hours,0)
     and coalesce(p_estimated_km,0)=coalesce(v_job.estimated_km,0)
     and coalesce(p_estimated_helper_hours,0)=coalesce(v_job.estimated_helper_hours,0)
     and coalesce(p_manual_adjustment,0)=coalesce(v_job.manual_adjustment,0) then
    v_total := round(greatest(0, v_job.estimated_total
      - case when v_job.operator_does_work then coalesce(v_job.operator_work_surcharge,0) else 0 end
      + v_operator_fee),2);
  end if;

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
    operator_does_work = v_operator,
    operator_work_hourly_rate = v_operator_rate,
    operator_work_surcharge = v_operator_fee,
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

revoke all on function private.update_editable_job_pricing(uuid, uuid, uuid, uuid, date, time without time zone, time without time zone, text, text, uuid, text, text, numeric, numeric, numeric, numeric, numeric, text, boolean) from public, anon;
grant execute on function private.update_editable_job_pricing(uuid, uuid, uuid, uuid, date, time without time zone, time without time zone, text, text, uuid, text, text, numeric, numeric, numeric, numeric, numeric, text, boolean) to authenticated;

-- The original endpoint remains backward compatible during rolling deployments.
create or replace function public.update_editable_job(p_job_id uuid, p_customer_id uuid, p_site_id uuid, p_vehicle_id uuid, p_planned_date date, p_planned_time time without time zone, p_planned_end_time time without time zone, p_address text, p_object_name text, p_work_type_id uuid, p_description text, p_access_notes text, p_estimated_hours numeric, p_estimated_drive_hours numeric, p_estimated_km numeric, p_estimated_helper_hours numeric, p_manual_adjustment numeric, p_manual_adjustment_reason text)
returns uuid language sql security invoker set search_path='' as $body$
  select private.update_editable_job_pricing($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,null);
$body$;

create or replace function public.update_editable_job_with_operator_work(p_job_id uuid, p_customer_id uuid, p_site_id uuid, p_vehicle_id uuid, p_planned_date date, p_planned_time time without time zone, p_planned_end_time time without time zone, p_address text, p_object_name text, p_work_type_id uuid, p_description text, p_access_notes text, p_estimated_hours numeric, p_estimated_drive_hours numeric, p_estimated_km numeric, p_estimated_helper_hours numeric, p_manual_adjustment numeric, p_manual_adjustment_reason text, p_operator_does_work boolean)
returns uuid language sql security invoker set search_path='' as $body$
  select private.update_editable_job_pricing($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19);
$body$;
revoke all on function public.update_editable_job_with_operator_work(uuid, uuid, uuid, uuid, date, time without time zone, time without time zone, text, text, uuid, text, text, numeric, numeric, numeric, numeric, numeric, text, boolean) from public, anon;
grant execute on function public.update_editable_job_with_operator_work(uuid, uuid, uuid, uuid, date, time without time zone, time without time zone, text, text, uuid, text, text, numeric, numeric, numeric, numeric, numeric, text, boolean) to authenticated;

create or replace function private.booking_phone_key(p_phone text)
returns text language sql immutable security invoker set search_path='' as $body$
  select case when length(n) between 7 and 8 then '372'||n else nullif(n,'') end
  from (select regexp_replace(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),'^00','') n) x;
$body$;
revoke all on function private.booking_phone_key(text) from public, anon, authenticated;
grant execute on function private.booking_phone_key(text) to service_role;

-- Called only inside the authenticated website import, never from the public browser.
-- Existing customer details are not overwritten. Conflicting matches remain unlinked.
create or replace function private.resolve_website_customer(p_details jsonb)
returns uuid language plpgsql security invoker set search_path='' as $body$
declare
  v_name text := nullif(btrim(p_details->>'customer_name'),'');
  v_key text := lower(regexp_replace(btrim(p_details->>'customer_name'),'[[:space:]]+',' ','g'));
  v_email text := nullif(lower(btrim(p_details->>'email')),'');
  v_phone text := private.booking_phone_key(p_details->>'phone');
  v_code text := nullif(regexp_replace(coalesce(p_details->>'registry_code',''),'[[:space:]]','','g'),'');
  v_type text;
  v_ids uuid[];
  v_names uuid[];
  v_id uuid;
begin
  if v_name is null or (v_email is null and v_phone is null and v_code is null) then return null; end if;
  v_type := case
    when p_details->>'customer_type' in ('company','ettevote') or v_code is not null then 'company'
    when p_details->>'customer_type' in ('person','eraisik') then 'person'
    when v_name ~* '(OÜ|osaühing|korteriühistu|KÜ|MTÜ|aktsiaselts|(^|[[:space:]])AS($|[[:space:]]))' then 'company'
    else 'person' end;
  -- Serialise this small customer-import path across AT references.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('website:customer-link',0));
  if v_code is not null then
    select array_agg(id) into v_ids from public.customers
      where nullif(regexp_replace(registry_code,'[[:space:]]','','g'),'')=v_code;
    if cardinality(v_ids)=1 then return v_ids[1]; end if;
    if cardinality(v_ids)>1 then return null; end if;
  end if;

  select array_agg(id) into v_names from public.customers
    where lower(regexp_replace(btrim(name),'[[:space:]]+',' ','g'))=v_key;
  if cardinality(v_names)>0 then
    select array_agg(id) into v_ids from public.customers c
      where c.id=any(v_names)
      and (v_code is null or nullif(btrim(c.registry_code),'') is null or c.registry_code=v_code)
      and ((v_email is not null and lower(btrim(c.email))=v_email)
        or (v_phone is not null and private.booking_phone_key(c.phone)=v_phone)
        or (nullif(btrim(c.email),'') is null and private.booking_phone_key(c.phone) is null)
        or (v_type='company' and c.type='company' and cardinality(v_names)=1));
    if cardinality(v_ids)=1 then return v_ids[1]; end if;
    return null;
  end if;

  -- A shared contact with a different name is ambiguous; do not create a duplicate.
  if exists (select 1 from public.customers c where
      (v_email is not null and lower(btrim(c.email))=v_email)
      or (v_phone is not null and private.booking_phone_key(c.phone)=v_phone)) then return null; end if;

  insert into public.customers(type,name,registry_code,contact_name,phone,email,billing_address,notes)
  values(v_type,v_name,v_code,nullif(btrim(p_details->>'contact_name'),''),
    nullif(btrim(p_details->>'phone'),''),v_email,nullif(btrim(p_details->>'billing_address'),''),
    'Lisatud kodulehe broneeringust '||coalesce(p_details->>'external_ref',''))
  returning id into v_id;
  return v_id;
end;
$body$;
revoke all on function private.resolve_website_customer(jsonb) from public, anon, authenticated;
grant execute on function private.resolve_website_customer(jsonb) to service_role;

create or replace function private.link_website_booking_customer()
returns trigger language plpgsql security invoker set search_path='' as $body$
begin
  if new.source='website' and jsonb_typeof(new.website_booking_details)='object' then
    if new.customer_id is null then
      new.customer_id := private.resolve_website_customer(new.website_booking_details);
    end if;
    if new.operator_work_hourly_rate is null then
      new.operator_work_hourly_rate := case when new.operator_does_work and new.estimated_hours>0
        then coalesce(new.operator_work_surcharge,0)/new.estimated_hours else 15 end;
    end if;
    -- Preserve the website's quote and the original on-site/travel distinction.
    if tg_op='INSERT' or old.website_booking_details is null then
      if lower(btrim(new.website_booking_details->>'area')) in ('tallinn','tallinna piires')
         or new.description ~* '(^|\n)Piirkond:[[:space:]]*(tallinn|tallinna piires)([[:space:]]|$)' then
        new.estimated_drive_hours := 1;
      end if;
      new.price_snapshot_json := coalesce(new.price_snapshot_json,jsonb_build_object(
        'hourlyRate',45,'minimumOrder',90,'driveHourlyRate',45,'kmRate',1,'helperHourlyRate',35,
        'operatorWorkHourlyRate',new.operator_work_hourly_rate,'capturedAt',now()));
    end if;
  end if;
  return new;
end;
$body$;
revoke all on function private.link_website_booking_customer() from public, anon, authenticated;
create trigger jobs_link_website_booking_customer
before insert or update of website_booking_details on public.jobs
for each row execute function private.link_website_booking_customer();
