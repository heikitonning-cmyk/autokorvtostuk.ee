create or replace function private.customer_price(p jsonb,p_start time,p_end time) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare
  k text; n numeric; duration numeric; minutes numeric;
  lift numeric; driver numeric; operator_work numeric; helper numeric; drive numeric; distance numeric;
  base numeric; calculated numeric; total numeric;
begin
  if jsonb_typeof(p) is distinct from 'object' or p->'version' is distinct from '1'::jsonb
    or jsonb_typeof(p->'lift_enabled') is distinct from 'boolean' or jsonb_typeof(p->'operator_work') is distinct from 'boolean' then
    raise exception 'Kontrolli objekti hinnastamist.' using errcode='23514';
  end if;
  foreach k in array array['lift_rate','driver_rate','operator_rate','helper_rate','drive_rate','km_rate','minimum','helper_count','drive_minutes','km','adjustment'] loop
    if jsonb_typeof(p->k) is distinct from 'number' then raise exception 'Hinnast puudub korrektne väli: %',k using errcode='23514'; end if;
    n:=(p->>k)::numeric;
    if (k<>'adjustment' and n<0) or (k<>'km' and n<>trunc(n)) or
      (k in ('lift_rate','driver_rate','operator_rate','helper_rate','drive_rate','km_rate') and n>999999) or
      (k in ('minimum','adjustment') and abs(n)>999999999) or
      (k='helper_count' and n>50) or (k='drive_minutes' and n>1440) or
      (k='km' and (n>10000 or n<>round(n,2))) then
      raise exception 'Hinnastamise väli on lubatud piiridest väljas: %',k using errcode='23514';
    end if;
  end loop;
  foreach k in array array['billed_minutes','operator_minutes','helper_minutes','agreed_total'] loop
    if not(p ? k) then raise exception 'Hinnastamise väli puudub: %',k using errcode='23514'; end if;
    if p->k<>'null'::jsonb then
      if jsonb_typeof(p->k)<>'number' then raise exception 'Kontrolli arvestatavat aega või kokkuleppehinda.' using errcode='23514'; end if;
      n:=(p->>k)::numeric;
      if n<>trunc(n) or (k='agreed_total' and (n<0 or n>999999999)) or (k<>'agreed_total' and (n<1 or n>1440)) then
        raise exception 'Kontrolli arvestatavat aega või kokkuleppehinda.' using errcode='23514';
      end if;
    end if;
  end loop;
  if p_start is not null and p_end>p_start then duration:=nullif(floor(extract(epoch from p_end)/60)-floor(extract(epoch from p_start)/60),0); end if;
  minutes:=coalesce((p->>'billed_minutes')::numeric,duration);
  lift:=case when (p->>'lift_enabled')::boolean then round(coalesce(minutes,0)*(p->>'lift_rate')::numeric/60) else 0 end;
  driver:=round(coalesce(minutes,0)*(p->>'driver_rate')::numeric/60);
  operator_work:=case when (p->>'operator_work')::boolean then round(coalesce((p->>'operator_minutes')::numeric,minutes,0)*(p->>'operator_rate')::numeric/60) else 0 end;
  helper:=round(coalesce((p->>'helper_minutes')::numeric,minutes,0)*(p->>'helper_rate')::numeric*(p->>'helper_count')::numeric/60);
  drive:=round((p->>'drive_minutes')::numeric*(p->>'drive_rate')::numeric/60);
  distance:=round((p->>'km')::numeric*(p->>'km_rate')::numeric);
  base:=lift+driver+operator_work+helper+drive+distance+(p->>'adjustment')::numeric;
  if minutes is not null then calculated:=greatest((p->>'minimum')::numeric,base); end if;
  total:=coalesce((p->>'agreed_total')::numeric,calculated);
  if total>999999999 then raise exception 'Objekti hind ületab lubatud piiri.' using errcode='23514'; end if;
  return jsonb_build_object('actualMinutes',duration,'minutes',minutes,'lift',lift,'driver',driver,'operator',operator_work,'helper',helper,
    'drive',drive,'distance',distance,'minimumTopUp',greatest(0,(p->>'minimum')::numeric-base),'calculated',calculated,'total',total);
end; $$;
revoke all on function private.customer_price(jsonb,time,time) from public,anon;
grant execute on function private.customer_price(jsonb,time,time) to authenticated;


-- Keep the older app editor consistent; explicit imported quotes remain preserved.
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
  v_total := round(greatest(v_minimum_order, v_subtotal + v_operator_fee), 2);
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
