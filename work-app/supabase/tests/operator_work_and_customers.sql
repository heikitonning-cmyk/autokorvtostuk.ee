-- Run in one transaction; fixtures, customer cards and audit events are rolled back.
begin;
create function pg_temp.edit_operator_job(p_id uuid,p_enabled boolean,p_hours numeric default 2,p_drive numeric default 0,p_km numeric default 0,p_helpers numeric default 0)
returns uuid language sql as $body$
  select public.update_editable_job_with_operator_work(
    j.id,j.customer_id,j.site_id,j.vehicle_id,j.planned_date,j.planned_time,j.planned_end_time,
    j.address,j.object_name,j.work_type_id,j.description,j.access_notes,
    p_hours,p_drive,p_km,p_helpers,j.manual_adjustment,j.manual_adjustment_reason,p_enabled)
  from public.jobs j where j.id=p_id;
$body$;
do $test$
declare
  manager_id uuid;
  operator_id uuid;
  j uuid;
  j2 uuid;
  j3 uuid;
  c uuid;
  manual_job uuid := gen_random_uuid();
  ref text := 'AT-'||floor(900000000000+random()*99999999999)::bigint::text;
  payload jsonb;
  before_row jsonb;
  after_row jsonb;
  before_customer jsonb;
  customer_count bigint;
  denied boolean;
begin
  select id into strict manager_id from public.users where role='manager' and active limit 1;
  select id into strict operator_id from public.users where role='operator' and active limit 1;
  select count(*) into customer_count from public.customers;
  payload := jsonb_build_object('external_ref',ref,'customer_name','Rollback Customer '||ref||' OÜ',
    'phone','+372 59999001','email',ref||'@example.invalid','operator_does_work',true,
    'operator_work_surcharge',30,'extra_worker_count',0,'area','Tallinna piires');
  execute 'set local role service_role';
  j := public.upsert_website_booking(ref,'2099-01-01','10:00','TEST CUSTOMER LINK','ROLLBACK ADDRESS '||ref,null,2,165,payload);
  select customer_id into c from public.jobs where id=j;
  if c is null then raise exception 'website booking did not create customer'; end if;
  if (select count(*) from public.customers)<>customer_count+1 then raise exception 'customer insert count'; end if;
  if (select type from public.customers where id=c)<>'company' then raise exception 'company type missing'; end if;
  if (select estimated_drive_hours from public.jobs where id=j)<>1 then raise exception 'Tallinn travel omitted'; end if;
  select to_jsonb(x) into before_customer from public.customers x where id=c;
  select to_jsonb(x) into before_row from public.jobs x where id=j;
  j2 := public.upsert_website_booking(ref,'2099-01-02','12:00','Changed','Changed',null,5,999,payload);
  if j2<>j or (select to_jsonb(x) from public.jobs x where id=j) is distinct from before_row then raise exception 'retry changed job'; end if;

  j2 := public.upsert_website_booking(ref||'1','2099-01-02','10:00','TEST','ROLLBACK OTHER',null,2,120,
    payload||jsonb_build_object('phone','59999001','customer_name','  rollback customer '||ref||' oü '));
  if (select customer_id from public.jobs where id=j2) is distinct from c then raise exception 'duplicate customer'; end if;
  if (select to_jsonb(x) from public.customers x where id=c) is distinct from before_customer then raise exception 'customer overwritten'; end if;

  j3 := public.upsert_website_booking(ref||'2','2099-01-03','10:00','TEST','ROLLBACK AMBIGUOUS',null,2,120,
    payload||'{"customer_name":"Different identity with shared contact"}'::jsonb);
  if (select customer_id from public.jobs where id=j3) is not null then raise exception 'ambiguous identity merged'; end if;
  if (select count(*) from public.customers)<>customer_count+1 then raise exception 'ambiguous duplicate created'; end if;
  execute 'reset role';

  insert into public.jobs(id,operator_id,status,estimated_hours,estimated_drive_hours,estimated_km,estimated_helper_hours,
    manual_adjustment,estimated_total,operator_does_work,operator_work_surcharge,operator_work_hourly_rate,
    price_snapshot_json,actual_total,operator_note,invoice_status)
  values(manual_job,operator_id,'kinnitatud',2,0,0,0,0,90,false,0,15,
    '{"hourlyRate":45,"minimumOrder":90,"driveHourlyRate":45,"kmRate":1,"helperHourlyRate":35,"operatorWorkHourlyRate":15}',123.45,'Keep this note','arveldatud');
  perform set_config('request.jwt.claim.sub',manager_id::text,true);
  execute 'set local role authenticated';
  perform pg_temp.edit_operator_job(manual_job,true);
  if (select estimated_total from public.jobs where id=manual_job)<>120 or
     (select operator_work_surcharge from public.jobs where id=manual_job)<>30 then raise exception 'manager operator work calculation'; end if;
  perform pg_temp.edit_operator_job(manual_job,true,1,1);
  if (select estimated_total from public.jobs where id=manual_job)<>105 then raise exception 'travel charged as operator work'; end if;
  perform pg_temp.edit_operator_job(manual_job,true,2,0,40,2);
  if (select estimated_total from public.jobs where id=manual_job)<>230 then raise exception 'outside Tallinn + helper calculation'; end if;
  if (select actual_total from public.jobs where id=manual_job)<>123.45 or
     (select operator_note from public.jobs where id=manual_job)<>'Keep this note' or
     (select invoice_status from public.jobs where id=manual_job)<>'arveldatud' then raise exception 'unrelated data changed'; end if;
  perform pg_temp.edit_operator_job(manual_job,false,2,0,40,2);
  if (select estimated_total from public.jobs where id=manual_job)<>200 or
     (select operator_work_surcharge from public.jobs where id=manual_job)<>0 then raise exception 'disable operator work'; end if;
  perform pg_temp.edit_operator_job(j,false,2,1);
  if (select estimated_total from public.jobs where id=j)<>135 then raise exception 'website quote not preserved'; end if;
  perform pg_temp.edit_operator_job(j,true,2,1);
  if (select estimated_total from public.jobs where id=j)<>165 then raise exception 'operator added twice to website quote'; end if;

  perform set_config('request.jwt.claim.sub',operator_id::text,true);
  perform pg_temp.edit_operator_job(manual_job,true,2,0,40,2);
  if (select operator_work_surcharge from public.jobs where id=manual_job)<>30 then raise exception 'operator cannot edit option'; end if;
  -- Rolling-deploy callers using the old RPC must preserve the operator option and fee.
  perform public.update_editable_job(x.id,x.customer_id,x.site_id,x.vehicle_id,x.planned_date,x.planned_time,x.planned_end_time,
    x.address,x.object_name,x.work_type_id,x.description,x.access_notes,2,0,40,2,0,null)
    from public.jobs x where x.id=manual_job;
  if (select estimated_total from public.jobs where id=manual_job)<>230 then raise exception 'legacy editor lost operator fee'; end if;
  perform public.mark_job_completed(manual_job,now()-interval '1 day');
  denied := false;
  begin perform pg_temp.edit_operator_job(manual_job,false); exception when others then denied:=true; end;
  if not denied then raise exception 'completed job was editable'; end if;
  execute 'reset role';
  select to_jsonb(x) into before_row from public.jobs x where id=manual_job;

  execute 'set local role service_role';
  update public.jobs set status='completed',completed_at=now()-interval '1 day' where id=j;
  select to_jsonb(x) into before_row from public.jobs x where id=j;
  perform public.upsert_website_booking(ref,'2099-01-01','10:00','TEST','ROLLBACK ADDRESS',null,2,165,payload);
  if (select to_jsonb(x) from public.jobs x where id=j) is distinct from before_row then raise exception 'sync reset edited/completed job'; end if;
  execute 'reset role';
  if has_function_privilege('anon','private.resolve_website_customer(jsonb)','execute') then raise exception 'anon can resolve clients'; end if;
  if has_function_privilege('authenticated','private.resolve_website_customer(jsonb)','execute') then raise exception 'browser can create clients via import'; end if;
  if has_function_privilege('anon','public.update_editable_job_with_operator_work(uuid,uuid,uuid,uuid,date,time,time,text,text,uuid,text,text,numeric,numeric,numeric,numeric,numeric,text,boolean)','execute') then raise exception 'anon can edit jobs'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true);
  execute 'set local role authenticated';
  denied:=false;
  begin perform public.update_editable_job_with_operator_work(j,null,null,null,null,null,null,null,null,null,null,null,2,0,0,0,0,null,false); exception when others then denied:=true; end;
  if not denied then raise exception 'unknown user edited job'; end if;
  execute 'reset role';
end;
$test$;
select 'PASS: customer creation/matching/conflicts/retries, manager/operator pricing, minimum/travel/helpers, quotes, completion preservation and access control' as result;
rollback;
