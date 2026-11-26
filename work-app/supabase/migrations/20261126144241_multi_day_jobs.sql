-- A continuation is another ordinary paid day, linked to the first job.
-- Existing jobs, prices, wages and signed documents are untouched.
alter table public.jobs add column continuation_root_id uuid references public.jobs(id) on delete restrict;
alter table public.jobs add constraint continuation_not_self check(continuation_root_id is distinct from id);
create index jobs_continuation_root_idx on public.jobs(continuation_root_id);
create unique index jobs_one_continuation_per_date on public.jobs(continuation_root_id,planned_date)
 where continuation_root_id is not null and status<>'tuhistatud';

create function private.guard_job_continuation() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' then
   if old.continuation_root_id is not null and exists(select 1 from public.job_delivery_sheets where job_id=old.continuation_root_id) then
     raise exception 'Päev kuulub allkirjastatud ühisele saatelehele. Seda päeva ei saa kustutada.' using errcode='23514';
   end if;
   return old;
 end if;
 if (tg_op='INSERT' and new.continuation_root_id is not null) or
    (tg_op='UPDATE' and new.continuation_root_id is distinct from old.continuation_root_id) then
   if current_setting('app.continuation_write',true) is distinct from 'yes' or not coalesce(private.is_manager(),false) then
     raise exception 'Kasuta nuppu Lisa järgmine päev.' using errcode='42501';
   end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_job_continuation() from public,anon,authenticated;
create trigger guard_job_continuation before insert or update or delete on public.jobs for each row execute function private.guard_job_continuation();

create function public.save_continuation_day(p_request_id uuid,p_date date,p_expected jsonb,p_day jsonb,p_jobs jsonb,p_workers jsonb,p_source_id uuid,p_new_job_id uuid,p_source_updated_at timestamptz)
returns uuid language plpgsql security invoker set search_path='' as $$
declare src public.jobs%rowtype; root_id uuid; day_id uuid; d date; prior boolean;
begin
 if auth.uid() is null or not coalesce(private.is_manager(),false) then raise exception 'Puudub juhataja õigus.' using errcode='42501'; end if;
 select * into src from public.jobs where id=p_source_id and status<>'tuhistatud';
 if not found then raise exception 'Algset tööd ei leitud.' using errcode='P0001'; end if;
 root_id:=coalesce(src.continuation_root_id,src.id);
 for d in select distinct x from unnest(array[src.planned_date,p_date]) x order by x loop
   perform pg_advisory_xact_lock(hashtextextended('work-day:'||d::text,0));
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('job-series:'||root_id::text,0));
 select exists(select 1 from public.work_day_revisions where request_id=p_request_id) into prior;
 -- Idempotency also includes the source and new job IDs.
 if prior then
   return public.save_dated_work_day(p_request_id,p_date,p_date,p_expected,p_day||jsonb_build_object('source_id',p_source_id,'new_job_id',p_new_job_id),p_jobs,p_workers);
 end if;
 select * into src from public.jobs where id=p_source_id for update;
 if src.updated_at is distinct from p_source_updated_at or src.status='tuhistatud' then raise exception 'Algset tööd on muudetud. Ava järgmise päeva vorm uuesti.' using errcode='P0001'; end if;
 if not exists(select 1 from public.jobs where id=root_id and status<>'tuhistatud') then raise exception 'Algne töö on tühistatud.' using errcode='P0001'; end if;
 if exists(select 1 from public.job_delivery_sheets where job_id=root_id) then raise exception 'Saateleht on juba allkirjastatud. Lisa uus töö eraldi saatelehega.' using errcode='P0001'; end if;
 if p_date<=src.planned_date or exists(select 1 from public.jobs where (id=root_id or continuation_root_id=root_id) and planned_date=p_date and status<>'tuhistatud') then
   raise exception 'Vali selle töö jaoks uus, hilisem kuupäev.' using errcode='P0001';
 end if;
 if p_new_job_id is null or exists(select 1 from public.jobs where id=p_new_job_id) or
   not exists(select 1 from jsonb_array_elements(p_jobs) j where (j->>'id')::uuid=p_new_job_id) then
   raise exception 'Uue päeva objekt puudub või on juba olemas.' using errcode='P0001';
 end if;
 day_id:=public.save_dated_work_day(p_request_id,p_date,p_date,p_expected,p_day||jsonb_build_object('source_id',p_source_id,'new_job_id',p_new_job_id),p_jobs,p_workers);
 perform set_config('app.continuation_write','yes',true);
 update public.jobs set continuation_root_id=root_id,customer_id=coalesce(customer_id,src.customer_id),vehicle_id=src.vehicle_id
 where id=p_new_job_id and work_day_id=day_id;
 perform set_config('app.continuation_write','',true);
 return day_id;
end $$;
revoke all on function public.save_continuation_day(uuid,date,jsonb,jsonb,jsonb,jsonb,uuid,uuid,timestamptz) from public,anon;
grant execute on function public.save_continuation_day(uuid,date,jsonb,jsonb,jsonb,jsonb,uuid,uuid,timestamptz) to authenticated;

-- Serialize signing with adding a day. A stale or incomplete preview cannot be signed.
create function private.check_series_sheet() returns trigger language plpgsql security invoker set search_path='' as $$
declare root_id uuid; members jsonb;
begin
 select coalesce(continuation_root_id,id) into root_id from public.jobs where id=new.job_id;
 if root_id is distinct from new.job_id then raise exception 'Ava selle töö ühine saateleht.' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(hashtextextended('job-series:'||root_id::text,0));
 perform 1 from public.jobs where (id=root_id or continuation_root_id=root_id) and status<>'tuhistatud' order by id for share;
 select jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at) order by id) into members
 from public.jobs where (id=root_id or continuation_root_id=root_id) and status<>'tuhistatud';
 if jsonb_array_length(members)>1 or new.snapshot->>'version'='2' then
   if jsonb_typeof(new.snapshot->'days') is distinct from 'array' then raise exception 'Saatelehelt puuduvad töö päevad.' using errcode='23514'; end if;
   if jsonb_array_length(new.snapshot->'days')<>jsonb_array_length(members) or
      exists(select 1 from jsonb_to_recordset(members) m(id uuid,updated_at timestamptz)
       full join jsonb_to_recordset(new.snapshot->'days') s("jobId" uuid,"sourceUpdatedAt" timestamptz) on m.id=s."jobId"
       where m.id is null or s."jobId" is null or m.updated_at is distinct from s."sourceUpdatedAt") then
      raise exception 'Töö päevad on muutunud. Ava uus eelvaade ja allkirjasta uuesti.' using errcode='23514';
   end if;
 end if;
 return new;
end $$;
revoke all on function private.check_series_sheet() from public,anon,authenticated;
create trigger check_series_sheet before insert on public.job_delivery_sheets for each row execute function private.check_series_sheet();
