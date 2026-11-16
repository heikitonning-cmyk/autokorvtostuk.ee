-- Object-level customer prices are independent from the paid crew day.
-- No historical quote or payroll data is changed by installing this migration.
alter table public.jobs add column customer_pricing jsonb;

create function private.customer_price(p jsonb,p_start time,p_end time) returns jsonb
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
  base:=lift+driver+helper+drive+distance+(p->>'adjustment')::numeric;
  if minutes is not null then calculated:=greatest((p->>'minimum')::numeric,base)+operator_work; end if;
  total:=coalesce((p->>'agreed_total')::numeric,calculated);
  if total>999999999 then raise exception 'Objekti hind ületab lubatud piiri.' using errcode='23514'; end if;
  return jsonb_build_object('actualMinutes',duration,'minutes',minutes,'lift',lift,'driver',driver,'operator',operator_work,'helper',helper,
    'drive',drive,'distance',distance,'minimumTopUp',greatest(0,(p->>'minimum')::numeric-base),'calculated',calculated,'total',total);
end; $$;
revoke all on function private.customer_price(jsonb,time,time) from public,anon;
grant execute on function private.customer_price(jsonb,time,time) to authenticated;

create function private.sync_customer_price() returns trigger
language plpgsql security invoker set search_path='' as $$
declare price jsonb; p jsonb:=new.customer_pricing;
begin
  if tg_op='UPDATE' and not coalesce(private.is_manager(),false) and
    (new.customer_pricing is distinct from old.customer_pricing or (p is not null and
     row(new.planned_time,new.planned_end_time,new.estimated_total,new.price_snapshot_json,new.operator_does_work,new.operator_work_surcharge)
     is distinct from row(old.planned_time,old.planned_end_time,old.estimated_total,old.price_snapshot_json,old.operator_does_work,old.operator_work_surcharge))) then
    raise exception 'Hindu saab muuta ainult juhataja.' using errcode='42501';
  end if;
  if p is null then return new; end if;
  if tg_op='INSERT' and not coalesce(private.is_manager(),false) then raise exception 'Hindu saab muuta ainult juhataja.' using errcode='42501'; end if;
  price:=private.customer_price(p,new.planned_time,new.planned_end_time);
  new.estimated_total:=(price->>'total')::numeric/100;
  new.estimated_hours:=coalesce((price->>'minutes')::numeric/60,0);
  new.estimated_drive_hours:=(p->>'drive_minutes')::numeric/60;
  new.estimated_km:=(p->>'km')::numeric;
  new.estimated_helper_hours:=coalesce((p->>'helper_minutes')::numeric,(price->>'minutes')::numeric,0)*(p->>'helper_count')::numeric/60;
  new.helper_used:=(p->>'helper_count')::integer>0;
  new.operator_does_work:=(p->>'operator_work')::boolean;
  new.operator_work_surcharge:=(price->>'operator')::numeric/100;
  new.operator_work_hourly_rate:=(p->>'operator_rate')::numeric/100;
  new.manual_adjustment:=(p->>'adjustment')::numeric/100;
  new.price_snapshot_json:=jsonb_build_object('hourlyRate',(p->>'lift_rate')::numeric/100,'driverHourlyRate',(p->>'driver_rate')::numeric/100,
    'operatorWorkHourlyRate',(p->>'operator_rate')::numeric/100,'helperHourlyRate',(p->>'helper_rate')::numeric/100,
    'driveHourlyRate',(p->>'drive_rate')::numeric/100,'kmRate',(p->>'km_rate')::numeric/100,'minimumOrder',(p->>'minimum')::numeric/100,
    'capturedAt',coalesce(old.price_snapshot_json->>'capturedAt',clock_timestamp()::text));
  return new;
end; $$;
revoke all on function private.sync_customer_price() from public,anon,authenticated;
create trigger ab_sync_customer_price before insert or update on public.jobs for each row execute function private.sync_customer_price();

create function public.save_priced_work_day(p_request_id uuid,p_date date,p_expected jsonb,p_day jsonb,p_jobs jsonb,p_workers jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare day_id uuid; already_saved boolean; j jsonb;
begin
  if not coalesce(private.is_manager(),false) then raise exception 'Puudub juhataja õigus.' using errcode='42501'; end if;
  -- Same lock as the core save: retries must never reapply a superseded quote.
  perform pg_advisory_xact_lock(hashtextextended('work-day:'||p_date::text,0));
  select exists(select 1 from public.work_day_revisions where request_id=p_request_id) into already_saved;
  day_id:=public.save_work_day(p_request_id,p_date,p_expected,p_day,p_jobs,p_workers);
  if already_saved then return day_id; end if;
  for j in select value from jsonb_array_elements(p_jobs) loop
    if jsonb_typeof(j->'customer_pricing') is distinct from 'object' then raise exception 'Objekti hind puudub.' using errcode='23514'; end if;
    update public.jobs set customer_pricing=j->'customer_pricing' where id=(j->>'id')::uuid and work_day_id=day_id;
    if not found then raise exception 'Objekti ei leitud.' using errcode='P0001'; end if;
  end loop;
  return day_id;
end; $$;
revoke all on function public.save_priced_work_day(uuid,date,jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.save_priced_work_day(uuid,date,jsonb,jsonb,jsonb,jsonb) to authenticated;
