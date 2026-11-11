-- Integration test: every fixture and mutation is rolled back, including audit events.
begin;
do $test$
declare
  manager_id uuid;
  operator_id uuid;
  manager_job uuid := gen_random_uuid();
  own_job uuid := gen_random_uuid();
  free_job uuid := gen_random_uuid();
  stop_id uuid := gen_random_uuid();
  photo_id uuid := gen_random_uuid();
  before_job jsonb;
  after_job jsonb;
  before_stop jsonb;
  before_photo jsonb;
  before_events jsonb;
  after_events jsonb;
  event_count bigint;
  test_date date := (clock_timestamp() at time zone 'Europe/Tallinn')::date - 1;
  completed_time timestamptz := (test_date + time '14:25') at time zone 'Europe/Tallinn';
  got uuid;
  denied boolean;
  v_status text;
begin
  select id into strict manager_id from public.users where role='manager' and active limit 1;
  select id into strict operator_id from public.users where role='operator' and active limit 1;
  if has_function_privilege('anon','public.mark_job_completed(uuid,timestamptz)','execute') then raise exception 'anon may complete'; end if;
  if (select prosecdef from pg_proc where oid='public.mark_job_completed(uuid,timestamptz)'::regprocedure) then raise exception 'RPC bypasses RLS'; end if;

  insert into public.jobs(id,operator_id,status,object_name,address,description,planned_date,planned_time,
    estimated_total,actual_total,actual_start,actual_end,actual_km,helper_used,helper_hours,
    operator_note,invoice_status,price_snapshot_json,manual_adjustment,manual_adjustment_reason)
  values (manager_job,manager_id,'kinnitatud','ROLLBACK completion test','TEST','Preserve description',
    test_date,'12:00',120,123.45,(test_date + time '12:00') at time zone 'Europe/Tallinn',(test_date + time '13:00') at time zone 'Europe/Tallinn',35,true,2,
    'Preserve operator note','arveldatud','{"hourlyRate":45,"minimumOrder":90}',-5,'Preserve adjustment');
  insert into public.jobs(id,operator_id,status,object_name) values
    (own_job,operator_id,'toob','ROLLBACK operator test'),(free_job,null,'uus','ROLLBACK free test');
  insert into public.job_stops(id,job_id,sequence_no,address_snapshot,description,status)
  values (stop_id,manager_job,1,'TEST STOP','Preserve pending stop','pending');
  insert into public.job_photos(id,job_id,job_stop_id,uploaded_by,storage_path,category)
  values (photo_id,manager_job,stop_id,manager_id,'rollback-test/'||photo_id||'.jpg','before');
  select to_jsonb(j) into before_job from public.jobs j where id=manager_job;
  select to_jsonb(s) into before_stop from public.job_stops s where id=stop_id;
  select to_jsonb(p) into before_photo from public.job_photos p where id=photo_id;
  select jsonb_agg(to_jsonb(e) order by id) into before_events from public.job_events e where job_id=manager_job;
  select count(*) into event_count from public.job_events where job_id=manager_job;

  perform set_config('request.jwt.claim.sub',manager_id::text,true);
  execute 'set local role authenticated';
  got := public.mark_job_completed(manager_job, completed_time);
  if got <> manager_job then raise exception 'wrong manager job'; end if;
  select to_jsonb(j) into after_job from public.jobs j where id=manager_job;
  if after_job->>'status' <> 'completed' or (after_job->>'completed_at')::timestamptz <> completed_time then raise exception 'backdate lost'; end if;
  if (after_job - array['status','completed_at','updated_at']) is distinct from (before_job - array['status','completed_at','updated_at']) then raise exception 'unrelated job data changed'; end if;
  if (select to_jsonb(s) from public.job_stops s where id=stop_id) is distinct from before_stop then raise exception 'stop changed'; end if;
  if (select to_jsonb(p) from public.job_photos p where id=photo_id) is distinct from before_photo then raise exception 'photo changed'; end if;
  if (select count(*) from public.job_events where job_id=manager_job) <> event_count+1 then raise exception 'completion audit missing'; end if;
  select jsonb_agg(to_jsonb(e) order by id) into after_events from public.job_events e where job_id=manager_job;
  if not (after_events @> before_events) then raise exception 'history changed'; end if;
  perform public.mark_job_completed(manager_job, completed_time - interval '1 day');
  if (select to_jsonb(j) from public.jobs j where id=manager_job) is distinct from after_job then raise exception 'retry changed job'; end if;
  if (select count(*) from public.job_events where job_id=manager_job) <> event_count+1 then raise exception 'duplicate audit'; end if;
  -- Simulate stale start/finish/confirm/cancel writes, including a billing overwrite.
  foreach v_status in array array['uus','kinnitatud','toob','tehtud','vajab_jareltegevust','tuhistatud'] loop
    denied := false;
    begin update public.jobs set status=v_status, actual_total=999 where id=manager_job;
    exception when check_violation then denied:=true; end;
    if not denied then raise exception 'stale status write accepted: %',v_status; end if;
    if (select to_jsonb(j) from public.jobs j where id=manager_job) is distinct from after_job then raise exception 'stale write changed job'; end if;
  end loop;
  -- The original shared calendar continues to include completed jobs.
  if not exists (select 1 from public.shared_lift_calendar() where id=manager_job) then raise exception 'completed job missing from calendar'; end if;
  denied := false;
  begin perform public.add_job_stops(manager_job,'[]'::jsonb,0); exception when others then denied:=true; end;
  if not denied then raise exception 'completed route remained editable'; end if;
  perform public.mark_job_completed(free_job,completed_time);
  denied := false;
  begin perform public.claim_job(free_job); exception when others then denied:=true; end;
  if not denied then raise exception 'completed job could be claimed'; end if;

  perform set_config('request.jwt.claim.sub',operator_id::text,true);
  denied := false;
  begin perform public.mark_job_completed(manager_job,completed_time); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'operator completed another job'; end if;
  denied := false;
  begin perform public.mark_job_completed(free_job,completed_time); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'operator completed unassigned job'; end if;
  denied := false;
  begin perform public.mark_job_completed(own_job,null); exception when invalid_parameter_value then denied:=true; end;
  if not denied then raise exception 'null completion accepted'; end if;
  denied := false;
  begin perform public.mark_job_completed(own_job,clock_timestamp()+interval '1 day'); exception when invalid_parameter_value then denied:=true; end;
  if not denied then raise exception 'future completion accepted'; end if;
  got := public.mark_job_completed(own_job,completed_time);
  if got <> own_job or not exists(select 1 from public.jobs where id=own_job and status='completed' and completed_at=completed_time) then raise exception 'assigned operator could not complete'; end if;

  execute 'reset role';
  update public.users set active=false where id=operator_id;
  execute 'set local role authenticated';
  denied := false;
  begin perform public.mark_job_completed(own_job,completed_time); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'inactive operator completed'; end if;
  execute 'reset role';
end;
$test$;
rollback;
select 'PASS: manager, assigned operator, foreign/unassigned/inactive/anonymous denial, backdate, future/null validation, idempotence, all job fields, photos, stops, history, calendar and completed-job locks; fixtures rolled back' as result;
