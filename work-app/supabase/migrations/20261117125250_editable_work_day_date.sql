-- Save edits and move the entire paid day in one transaction.
create function public.save_dated_work_day(
  p_request_id uuid,p_date date,p_target_date date,p_expected jsonb,p_day jsonb,p_jobs jsonb,p_workers jsonb
) returns uuid language plpgsql security invoker set search_path='' as $$
declare day_id uuid; d date; already_saved boolean; saved_day jsonb;
begin
  if not coalesce(private.is_manager(),false) then raise exception 'Puudub juhataja õigus.' using errcode='42501'; end if;
  if p_date is null or p_target_date is null or p_target_date not between '2000-01-01' and '2099-12-31' then
    raise exception 'Vali korrektne kuupäev.' using errcode='23514';
  end if;
  for d in select distinct x from unnest(array[p_date,p_target_date]) x order by x loop
    perform pg_advisory_xact_lock(hashtextextended('work-day:'||d::text,0));
  end loop;
  -- Include the destination in the existing idempotency hash.
  saved_day:=p_day||jsonb_build_object('target_date',p_target_date);
  select exists(select 1 from public.work_day_revisions where request_id=p_request_id) into already_saved;
  if already_saved then
    return public.save_priced_work_day(p_request_id,p_date,p_expected,saved_day,p_jobs,p_workers);
  end if;
  if p_target_date<>p_date and (
    exists(select 1 from public.work_days where work_date=p_target_date) or
    exists(select 1 from public.jobs where planned_date=p_target_date and status<>'tuhistatud') or
    exists(select 1 from public.payroll_entries where work_date=p_target_date)
  ) then
    raise exception 'Valitud kuupäeval on juba tööpäev, objektid või palgatunnid. Vali vaba kuupäev. Ühtegi muudatust ei salvestatud.' using errcode='P0001';
  end if;
  day_id:=public.save_priced_work_day(p_request_id,p_date,p_expected,saved_day,p_jobs,p_workers);
  if p_target_date<>p_date then
    perform set_config('app.work_day_write','yes',true);
    update public.work_days set work_date=p_target_date,updated_at=clock_timestamp() where id=day_id;
    update public.jobs set planned_date=p_target_date,
      start_planned=(p_target_date+planned_time) at time zone 'Europe/Tallinn',
      end_planned=(p_target_date+planned_end_time) at time zone 'Europe/Tallinn'
      where work_day_id=day_id;
    update public.payroll_entries set work_date=p_target_date where work_day_id=day_id;
    perform set_config('app.work_day_write','',true);
  end if;
  return day_id;
end; $$;
revoke all on function public.save_dated_work_day(uuid,date,date,jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.save_dated_work_day(uuid,date,date,jsonb,jsonb,jsonb,jsonb) to authenticated;
