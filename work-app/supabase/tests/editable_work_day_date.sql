begin;
do $test$
declare
  request uuid:=gen_random_uuid(); move_request uuid:=gen_random_uuid(); worker uuid:=gen_random_uuid(); job uuid:=gen_random_uuid(); day_id uuid; result uuid;
  expected jsonb:='{"revision":0,"jobs":[],"entries":[]}';
  day jsonb:='{"start_minute":480,"end_minute":600,"break_minutes":0,"next_day":false}';
  workers jsonb; jobs jsonb; failed boolean;
begin
  if exists(select 1 from public.work_days where work_date between '2098-01-01' and '2098-01-03') or
     exists(select 1 from public.jobs where planned_date between '2098-01-01' and '2098-01-03') or
     exists(select 1 from public.payroll_entries where work_date between '2098-01-01' and '2098-01-03') then raise exception 'Test dates occupied'; end if;
  perform set_config('request.jwt.claim.sub',(select id::text from public.users where role='manager' and active limit 1),true);
  perform set_config('role','authenticated',true);
  workers:=jsonb_build_array(jsonb_build_object('id',worker,'is_new',true,'name','ROLLBACK date test','hourly_rate_cents',1300,'override',false));
  jobs:=jsonb_build_array(jsonb_build_object('id',job,'address','ROLLBACK test address','driver_employee_id',worker,'planned_time','09:00','planned_end_time','10:00','customer_pricing',
    '{"version":1,"lift_enabled":true,"operator_work":false,"lift_rate":4500,"driver_rate":0,"operator_rate":1500,"helper_rate":3500,"drive_rate":4500,"km_rate":100,"minimum":9000,"helper_count":0,"drive_minutes":0,"km":0,"adjustment":0,"billed_minutes":null,"operator_minutes":null,"helper_minutes":null,"agreed_total":null}'::jsonb));
  day_id:=public.save_dated_work_day(request,'2098-01-01','2098-01-01',expected,day,jobs,workers);
  select jsonb_build_object('revision',revision,'jobs',(select jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at)) from public.jobs where work_day_id=day_id),
    'entries',(select jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at)) from public.payroll_entries where work_day_id=day_id)) into expected from public.work_days where id=day_id;
  workers:=jsonb_build_array(jsonb_build_object('id',worker,'override',false));
  result:=public.save_dated_work_day(move_request,'2098-01-01','2098-01-02',expected,day,jobs,workers);
  if result<>day_id or not exists(select 1 from public.work_days where id=day_id and work_date='2098-01-02') or
    not exists(select 1 from public.jobs where id=job and planned_date='2098-01-02' and start_planned=('2098-01-02 09:00'::timestamp at time zone 'Europe/Tallinn') and estimated_total=90) or
    not exists(select 1 from public.payroll_entries where employee_id=worker and work_date='2098-01-02' and wage_cents=2600) then raise exception 'Move failed'; end if;
  result:=public.save_dated_work_day(move_request,'2098-01-01','2098-01-02',expected,day,jobs,workers);
  if result<>day_id then raise exception 'Retry failed'; end if;
  failed:=false;
  begin
    perform public.save_dated_work_day(move_request,'2098-01-01','2098-01-03',expected,day,jobs,workers);
  exception when raise_exception then failed:=true; end;
  if not failed then raise exception 'Changed retry accepted'; end if;
  failed:=false;
  begin
    perform public.save_dated_work_day(gen_random_uuid(),'2098-01-03','2098-01-02','{"revision":0,"jobs":[],"entries":[]}',day,'[]','[]');
  exception when raise_exception then failed:=true; end;
  if not failed or exists(select 1 from public.work_days where work_date='2098-01-03') then raise exception 'Occupied date not rejected atomically'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  failed:=false;
  begin
    perform public.save_dated_work_day(gen_random_uuid(),'2098-01-03','2098-01-03','{"revision":0,"jobs":[],"entries":[]}',day,'[]','[]');
  exception when insufficient_privilege then failed:=true; end;
  if not failed then raise exception 'Authorization failed'; end if;
end; $test$;
rollback;