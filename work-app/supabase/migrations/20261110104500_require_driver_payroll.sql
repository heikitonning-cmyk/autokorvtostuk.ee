create or replace function public.save_simple_job(
  p_job_id uuid, p_expected_updated_at timestamptz, p_job jsonb,
  p_payroll jsonb default null, p_expected_entry_updated_at timestamptz default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_old public.jobs%rowtype;
  v_entry public.payroll_entries%rowtype;
  v_driver uuid := nullif(p_job->>'driver_employee_id','')::uuid;
  v_site uuid := nullif(p_job->>'site_id','')::uuid;
  v_site_name text;
  v_customer uuid := nullif(p_job->>'customer_id','')::uuid;
  v_address text := nullif(btrim(p_job->>'address'),'');
  v_description text := nullif(btrim(p_job->>'description'),'');
  v_phone text := nullif(btrim(p_job->>'contact_phone'),'');
  v_date date := nullif(p_job->>'planned_date','')::date;
  v_time time := nullif(p_job->>'planned_time','')::time;
  v_start timestamptz;
  v_hash text := md5(jsonb_build_object('job',p_job,'payroll',p_payroll)::text);
  v_exists boolean;
begin
  if not coalesce(private.is_manager(),false) then raise exception 'Puudub juhataja õigus.' using errcode='42501'; end if;
  if p_job_id is null or p_job is null or jsonb_typeof(p_job)<>'object' then
    raise exception 'Töö andmed puuduvad.' using errcode='23514';
  end if;
  -- Serializes creation retries using the same client-generated ID.
  perform pg_advisory_xact_lock(hashtextextended(p_job_id::text,0));
  select * into v_old from public.jobs where id=p_job_id for update;
  v_exists := found;
  if v_exists and p_expected_updated_at is null then
    if v_old.simple_request_hash = v_hash then return p_job_id; end if;
    raise exception 'Töö on juba salvestatud. Ava töö uuesti.' using errcode='P0001';
  end if;
  if (v_exists and v_old.updated_at is distinct from p_expected_updated_at) or (not v_exists and p_expected_updated_at is not null) then
    raise exception 'Tööd on vahepeal muudetud. Ava töö uuesti.' using errcode='P0001';
  end if;
  if length(v_address)>500 or length(v_description)>2000 or length(v_phone)>50 or
    (v_date is not null and v_date not between '2000-01-01' and '2099-12-31') or v_time='24:00'::time then
    raise exception 'Kontrolli töö kuupäeva, kellaaega ja väljade pikkust.' using errcode='23514';
  end if;
  if v_site is not null then
    -- Preserve an existing archived site, but do not allow new assignments to it.
    select customer_id,name into v_customer,v_site_name from public.customer_sites
      where id=v_site and (active or (v_exists and v_old.site_id=v_site));
    if not found then raise exception 'Aadress puudub või on arhiveeritud.' using errcode='23514'; end if;
  end if;
  select * into v_entry from public.payroll_entries where job_id=p_job_id for update;
  if (v_driver is not null or v_entry.id is not null) and p_payroll is null then
    raise exception 'Juhi tööaja jaoks täida kuupäev, väljasõit, lõpetamine ja paus.' using errcode='23514';
  end if;
  if p_payroll is not null then
    if jsonb_typeof(p_payroll)<>'object' or v_driver is null or
      nullif(p_payroll->>'work_date','') is null or p_payroll->>'start_minute' is null or
      p_payroll->>'end_minute' is null or p_payroll->>'break_minutes' is null or p_payroll->>'next_day' is null then
      raise exception 'Vali juht ning täida tööaja kuupäev, väljasõit, lõpetamine ja paus.' using errcode='23514';
    end if;
    if v_entry.updated_at is distinct from p_expected_entry_updated_at then
      raise exception 'Juhi tööaega on vahepeal muudetud. Ava töö uuesti.' using errcode='P0001';
    end if;
  end if;
  v_start := case when v_date is not null and v_time is not null then (v_date+v_time) at time zone 'Europe/Tallinn' else null end;
  if v_exists then
    update public.jobs set address=v_address, description=v_description, contact_phone=v_phone, dispatch_managed=true,
      driver_employee_id=v_driver, site_id=v_site, customer_id=v_customer,
      object_name=case when site_id is distinct from v_site then v_site_name else object_name end,
      planned_date=v_date, planned_time=v_time, start_planned=v_start,
      -- Retain a legacy duration only while its original schedule is unchanged.
      end_planned=case when planned_date is not distinct from v_date and planned_time is not distinct from v_time then end_planned else null end,
      planned_end_time=case when planned_date is not distinct from v_date and planned_time is not distinct from v_time then planned_end_time else null end
    where id=p_job_id;
  else
    insert into public.jobs(id,address,description,contact_phone,driver_employee_id,site_id,customer_id,object_name,
      planned_date,planned_time,start_planned,status,created_by,simple_request_hash,dispatch_managed)
    values(p_job_id,v_address,v_description,v_phone,v_driver,v_site,v_customer,v_site_name,
      v_date,v_time,v_start,'kinnitatud',auth.uid(),v_hash,true);
  end if;
  if p_payroll is not null then
    if v_entry.id is null then
      insert into public.payroll_entries(job_id,employee_id,site_id,work_date,start_minute,end_minute,next_day,break_minutes,note)
      values(p_job_id,v_driver,v_site,(p_payroll->>'work_date')::date,(p_payroll->>'start_minute')::integer,
        (p_payroll->>'end_minute')::integer,(p_payroll->>'next_day')::boolean,(p_payroll->>'break_minutes')::integer,
        left(coalesce(v_description,v_address,'Juhi tööaeg'),1000));
    else
      update public.payroll_entries set employee_id=v_driver,work_date=(p_payroll->>'work_date')::date,
        start_minute=(p_payroll->>'start_minute')::integer,end_minute=(p_payroll->>'end_minute')::integer,
        next_day=(p_payroll->>'next_day')::boolean,break_minutes=(p_payroll->>'break_minutes')::integer
      where id=v_entry.id;
    end if;
  end if;
  return p_job_id;
end; $$;
