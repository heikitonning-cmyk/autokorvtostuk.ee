-- A paid day owns one wage interval per worker; jobs retain independent appointments.
-- Existing entries and payments are unchanged until a manager explicitly saves a day.
create table public.work_days (
  id uuid primary key default gen_random_uuid(),
  work_date date not null unique check (work_date between '2000-01-01' and '2099-12-31'),
  start_minute integer not null check (start_minute between 0 and 1439),
  end_minute integer not null check (end_minute between 0 and 1439),
  next_day boolean not null default false,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  check (end_minute + case when next_day then 1440 else 0 end - start_minute between 1 and 1440),
  check (end_minute + case when next_day then 1440 else 0 end - start_minute > break_minutes)
);
alter table public.jobs add column work_day_id uuid references public.work_days(id) on delete restrict;
alter table public.payroll_entries add column work_day_id uuid references public.work_days(id) on delete restrict;
alter table public.payroll_entries add column day_time_override boolean not null default false;
alter table public.payroll_entries add constraint payroll_day_has_no_job check (work_day_id is null or (job_id is null and end_minute is not null));
create index jobs_work_day_idx on public.jobs(work_day_id);
create unique index payroll_one_worker_per_day on public.payroll_entries(work_day_id,employee_id) where work_day_id is not null;

create table public.work_day_revisions (
  request_id uuid primary key,
  work_day_id uuid not null references public.work_days(id) on delete restrict,
  request_hash text not null,
  previous_state jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) default auth.uid()
);
create index work_day_revisions_day_idx on public.work_day_revisions(work_day_id);
create index work_day_revisions_created_by_idx on public.work_day_revisions(created_by);
alter table public.work_days enable row level security;
alter table public.work_day_revisions enable row level security;
revoke all on public.work_days,public.work_day_revisions from anon,authenticated;
grant select,insert,update on public.work_days to authenticated;
grant select,insert on public.work_day_revisions to authenticated;
create policy "manager work days" on public.work_days for all to authenticated
  using ((select private.is_manager())) with check ((select private.is_manager()));
create policy "manager day revisions" on public.work_day_revisions for all to authenticated
  using ((select private.is_manager())) with check ((select private.is_manager()));

-- Older browser tabs must not split a managed day or create duplicate wages.
create function private.guard_work_day_write() returns trigger
language plpgsql security invoker set search_path='' as $$
declare d date; old_date date; new_date date; managed boolean;
begin
  if tg_table_name='work_days' or tg_table_name='work_day_revisions' then
    if current_setting('app.work_day_write',true) is distinct from 'yes' or not coalesce(private.is_manager(),false) then
      raise exception 'Muuda päeva aegasid päeva vaates.' using errcode='23514';
    end if;
    return new;
  end if;
  if tg_table_name='jobs' then
    if tg_op<>'INSERT' then old_date:=old.planned_date; end if;
    if tg_op<>'DELETE' then new_date:=new.planned_date; end if;
  else
    if tg_op<>'INSERT' then old_date:=old.work_date; end if;
    if tg_op<>'DELETE' then new_date:=new.work_date; end if;
  end if;
  for d in select distinct x from unnest(array[old_date,new_date]) x where x is not null order by x loop
    perform pg_advisory_xact_lock(hashtextextended('work-day:'||d::text,0));
  end loop;
  if current_setting('app.work_day_write',true)='yes' and coalesce(private.is_manager(),false) then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if tg_table_name='payroll_entries' then
    managed:=exists(select 1 from public.work_days where work_date in (old_date,new_date));
    if tg_op<>'DELETE' then managed:=managed or new.work_day_id is not null; end if;
    if tg_op<>'INSERT' then managed:=managed or old.work_day_id is not null; end if;
  else
    managed:=false;
    if tg_op='INSERT' then managed:=new.work_day_id is not null;
    elsif tg_op='UPDATE' then
      managed:=(old.work_day_id is not null or new.work_day_id is not null) and
        row(new.work_day_id,new.planned_date,new.planned_time,new.planned_end_time,new.driver_employee_id)
        is distinct from row(old.work_day_id,old.planned_date,old.planned_time,old.planned_end_time,old.driver_employee_id);
    end if;
  end if;
  if managed then raise exception 'See tööaeg kuulub ühisesse tööpäeva. Ava päeva muutmine.' using errcode='23514'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function private.guard_work_day_write() from public,anon,authenticated;
create trigger aa_guard_work_day before insert or update on public.work_days for each row execute function private.guard_work_day_write();
create trigger aa_guard_work_day before insert on public.work_day_revisions for each row execute function private.guard_work_day_write();
create trigger aa_guard_work_day before insert or update or delete on public.payroll_entries for each row execute function private.guard_work_day_write();
create trigger aa_guard_work_day before insert or update or delete on public.jobs for each row execute function private.guard_work_day_write();

create function public.save_work_day(p_request_id uuid,p_date date,p_expected jsonb,p_day jsonb,p_jobs jsonb,p_workers jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  wd public.work_days%rowtype; previous public.work_day_revisions%rowtype;
  j jsonb; w jsonb; old_job public.jobs%rowtype; kept public.payroll_entries%rowtype;
  job_id uuid; worker_id uuid; v_site_id uuid; v_customer_id uuid; driver_id uuid;
  job_start time; job_end time; current_jobs jsonb; current_entries jsonb; snapshot jsonb;
  request_hash text:=md5(jsonb_build_array(p_date,p_expected,p_day,p_jobs,p_workers)::text);
  worker_ids uuid[]; entry_sites uuid[]; start_value integer; end_value integer; break_value integer; next_value boolean;
begin
  if not coalesce(private.is_manager(),false) then raise exception 'Puudub juhataja õigus.' using errcode='42501'; end if;
  if p_request_id is null or p_date is null or p_date not between '2000-01-01' and '2099-12-31' or
    jsonb_typeof(p_day) is distinct from 'object' or jsonb_typeof(p_expected) is distinct from 'object' or
    jsonb_typeof(p_jobs) is distinct from 'array' or jsonb_typeof(p_workers) is distinct from 'array' then
    raise exception 'Päeva andmed ei ole korrektsed.' using errcode='23514';
  end if;
  if jsonb_array_length(p_jobs)>100 or jsonb_array_length(p_workers)>100 then raise exception 'Päevas võib olla kuni 100 objekti ja töölist.' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended('work-day:'||p_date::text,0));
  select * into previous from public.work_day_revisions where request_id=p_request_id;
  if found then
    if previous.request_hash=request_hash then return previous.work_day_id; end if;
    raise exception 'See salvestus on juba tehtud. Ava päev uuesti.' using errcode='P0001';
  end if;
  select * into wd from public.work_days where work_date=p_date for update;
  if coalesce(wd.revision,0) is distinct from (p_expected->>'revision')::integer then
    raise exception 'Päeva on vahepeal muudetud. Ava päev uuesti.' using errcode='P0001';
  end if;
  -- Lock the complete date, not just the rows supplied by a potentially stale client.
  perform 1 from public.jobs where planned_date=p_date and status<>'tuhistatud' order by id for update;
  perform 1 from public.payroll_entries where work_date=p_date order by id for update;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at) order by id),'[]') into current_jobs
    from public.jobs where planned_date=p_date and status<>'tuhistatud';
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at) order by id),'[]') into current_entries
    from public.payroll_entries where work_date=p_date;
  -- Compare timestamps as timestamptz so equivalent +00:00 / Z encodings match.
  if exists(select 1 from jsonb_to_recordset(current_jobs) as c(id uuid,updated_at timestamptz)
      full join jsonb_to_recordset(p_expected->'jobs') as e(id uuid,updated_at timestamptz) using(id)
      where c.updated_at is distinct from e.updated_at) or
    exists(select 1 from jsonb_to_recordset(current_entries) as c(id uuid,updated_at timestamptz)
      full join jsonb_to_recordset(p_expected->'entries') as e(id uuid,updated_at timestamptz) using(id)
      where c.updated_at is distinct from e.updated_at) or
    jsonb_typeof(p_expected->'jobs') is distinct from 'array' or jsonb_typeof(p_expected->'entries') is distinct from 'array' then
    raise exception 'Päeva tööd või tunnid on vahepeal muutunud. Ava päev uuesti.' using errcode='P0001';
  end if;
  if exists(select 1 from public.payroll_entries where work_date=p_date and end_minute is null) then
    raise exception 'Lõpeta esmalt selle päeva käimasolevad tööajad.' using errcode='23514';
  end if;
  if exists(select 1 from public.payroll_entries e join public.jobs j on j.id=e.job_id
    where (j.planned_date=p_date and e.work_date<>p_date) or (e.work_date=p_date and j.planned_date is distinct from p_date)) then
    raise exception 'Varasema töö ja palgakirje kuupäevad erinevad. Paranda kõigepealt üksikkirje kuupäev.' using errcode='23514';
  end if;
  if exists(select 1 from public.payroll_entries where work_date=p_date group by employee_id having count(distinct hourly_rate_cents)>1) then
    raise exception 'Samal töölisel on sel päeval erinevad tunnihinnad. Neid ei saa üheks päevakirjeks ühendada.' using errcode='23514';
  end if;
  if exists(select 1 from public.jobs where planned_date=p_date and status<>'tuhistatud'
    and id not in (select (value->>'id')::uuid from jsonb_array_elements(p_jobs))) or
    (select count(distinct value->>'id') from jsonb_array_elements(p_jobs))<>jsonb_array_length(p_jobs) or
    (select count(distinct value->>'id') from jsonb_array_elements(p_workers))<>jsonb_array_length(p_workers) then
    raise exception 'Päeva objektide või tööliste nimekiri ei ole täielik.' using errcode='23514';
  end if;
  select coalesce(array_agg((value->>'id')::uuid),'{}'::uuid[]) into worker_ids from jsonb_array_elements(p_workers);
  snapshot:=jsonb_build_object('day',to_jsonb(wd),'jobs',(select coalesce(jsonb_agg(to_jsonb(snapshot_job)),'[]') from public.jobs snapshot_job where planned_date=p_date),
    'entries',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from public.payroll_entries e where work_date=p_date),
    'sites',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.payroll_entry_sites s join public.payroll_entries e on e.id=s.entry_id where e.work_date=p_date));
  perform set_config('app.work_day_write','yes',true);
  if wd.id is null then
    insert into public.work_days(work_date,start_minute,end_minute,break_minutes,next_day)
      values(p_date,(p_day->>'start_minute')::integer,(p_day->>'end_minute')::integer,(p_day->>'break_minutes')::integer,(p_day->>'next_day')::boolean) returning * into wd;
  else
    update public.work_days set start_minute=(p_day->>'start_minute')::integer,end_minute=(p_day->>'end_minute')::integer,
      break_minutes=(p_day->>'break_minutes')::integer,next_day=(p_day->>'next_day')::boolean,revision=revision+1,updated_at=clock_timestamp()
      where id=wd.id returning * into wd;
  end if;
  for w in select value from jsonb_array_elements(p_workers) loop
    worker_id:=(w->>'id')::uuid;
    if coalesce((w->>'is_new')::boolean,false) then
      insert into public.payroll_employees(id,name,hourly_rate_cents) values(worker_id,btrim(w->>'name'),(w->>'hourly_rate_cents')::integer);
    elsif not exists(select 1 from public.payroll_employees where id=worker_id and
      (active or exists(select 1 from public.payroll_entries where employee_id=worker_id and work_date=p_date))) then
      raise exception 'Tööline puudub või on arhiveeritud.' using errcode='23514';
    end if;
  end loop;
  for j in select value from jsonb_array_elements(p_jobs) loop
    job_id:=(j->>'id')::uuid; v_site_id:=nullif(j->>'site_id','')::uuid; driver_id:=nullif(j->>'driver_employee_id','')::uuid;
    select * into old_job from public.jobs where id=job_id for update;
    if old_job.id is not null and (old_job.planned_date is distinct from p_date or old_job.status='tuhistatud') then
      raise exception 'Objekt kuulub teisele päevale või on tühistatud.' using errcode='23514';
    end if;
    if nullif(btrim(j->>'address'),'') is null or length(j->>'address')>500 or length(j->>'description')>2000 or length(j->>'contact_phone')>50 then
      raise exception 'Sisesta objekti aadress ja kontrolli väljade pikkust.' using errcode='23514';
    end if;
    job_start:=nullif(j->>'planned_time','')::time; job_end:=nullif(j->>'planned_end_time','')::time;
    if job_start='24:00'::time or job_end='24:00'::time or (job_end is not null and (job_start is null or job_end<=job_start)) then
      raise exception 'Objekti lõpp peab olema sama päeva algusest hilisem.' using errcode='23514';
    end if;
    if driver_id is not null and not (driver_id=any(worker_ids)) then raise exception 'Lisa juht ka päeva meeskonda.' using errcode='23514'; end if;
    v_customer_id:=old_job.customer_id;
    if v_site_id is not null then
      select customer_sites.customer_id into v_customer_id from public.customer_sites where id=v_site_id and (active or old_job.site_id=v_site_id);
      if not found then raise exception 'Salvestatud aadress puudub või on arhiveeritud.' using errcode='23514'; end if;
    end if;
    if old_job.id is null then
      insert into public.jobs(id,work_day_id,address,object_name,description,contact_phone,driver_employee_id,site_id,customer_id,
        planned_date,planned_time,planned_end_time,start_planned,end_planned,status,created_by,dispatch_managed)
      values(job_id,wd.id,btrim(j->>'address'),btrim(j->>'address'),nullif(btrim(j->>'description'),''),nullif(btrim(j->>'contact_phone'),''),driver_id,v_site_id,v_customer_id,
        p_date,job_start,job_end,(p_date+job_start) at time zone 'Europe/Tallinn',(p_date+job_end) at time zone 'Europe/Tallinn','kinnitatud',auth.uid(),true);
    else
      update public.jobs set work_day_id=wd.id,address=btrim(j->>'address'),object_name=btrim(j->>'address'),description=nullif(btrim(j->>'description'),''),
        contact_phone=nullif(btrim(j->>'contact_phone'),''),driver_employee_id=driver_id,site_id=v_site_id,customer_id=v_customer_id,
        planned_time=job_start,planned_end_time=job_end,start_planned=(p_date+job_start) at time zone 'Europe/Tallinn',
        end_planned=(p_date+job_end) at time zone 'Europe/Tallinn',dispatch_managed=true where id=job_id;
    end if;
  end loop;
  delete from public.payroll_entries where work_date=p_date and not(employee_id=any(worker_ids));
  for w in select value from jsonb_array_elements(p_workers) loop
    worker_id:=(w->>'id')::uuid;
    select * into kept from public.payroll_entries where work_date=p_date and employee_id=worker_id order by created_at,id limit 1;
    select coalesce(array_agg(distinct s.site_id),'{}'::uuid[]) into entry_sites from public.payroll_entry_sites s
      join public.payroll_entries e on e.id=s.entry_id where e.work_date=p_date and e.employee_id=worker_id;
    delete from public.payroll_entries where work_date=p_date and employee_id=worker_id and id<>kept.id;
    if coalesce((w->>'override')::boolean,false) then
      start_value:=(w->>'start_minute')::integer; end_value:=(w->>'end_minute')::integer;
      break_value:=(w->>'break_minutes')::integer; next_value:=(w->>'next_day')::boolean;
    else
      start_value:=wd.start_minute; end_value:=wd.end_minute; break_value:=wd.break_minutes; next_value:=wd.next_day;
    end if;
    if kept.id is null then
      insert into public.payroll_entries(employee_id,work_day_id,work_date,start_minute,end_minute,break_minutes,next_day,day_time_override,note)
      values(worker_id,wd.id,p_date,start_value,end_value,break_value,next_value,coalesce((w->>'override')::boolean,false),'') returning * into kept;
    else
      update public.payroll_entries set work_day_id=wd.id,job_id=null,start_minute=start_value,end_minute=end_value,
        break_minutes=break_value,next_day=next_value,day_time_override=coalesce((w->>'override')::boolean,false) where id=kept.id;
    end if;
    insert into public.payroll_entry_sites(entry_id,site_id) select kept.id,s from unnest(entry_sites) s on conflict do nothing;
  end loop;
  insert into public.work_day_revisions(request_id,work_day_id,request_hash,previous_state) values(p_request_id,wd.id,request_hash,snapshot);
  perform set_config('app.work_day_write','',true);
  return wd.id;
end; $$;
revoke all on function public.save_work_day(uuid,date,jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.save_work_day(uuid,date,jsonb,jsonb,jsonb,jsonb) to authenticated;
