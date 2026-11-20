alter table public.jobs add column payer_name text check(length(payer_name)<=200);
create function private.validate_job_payer() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if (tg_op='INSERT' and new.payer_name is not null) or (tg_op='UPDATE' and new.payer_name is distinct from old.payer_name) then
    if not coalesce(private.is_manager(),false) then raise exception 'Maksja nime muudab juhataja.' using errcode='42501'; end if;
    new.payer_name:=nullif(btrim(new.payer_name),'');
  end if;
  return new;
end; $$;
revoke all on function private.validate_job_payer() from public,anon,authenticated;
create trigger validate_job_payer before insert or update on public.jobs for each row execute function private.validate_job_payer();
create or replace function private.prepare_job_invoice() returns trigger
language plpgsql security invoker set search_path='' as $$
declare j public.jobs%rowtype;
begin
  if tg_op='INSERT' then
    select * into j from public.jobs where id=new.job_id;
    if not found or j.status not in ('completed','tehtud','vajab_jareltegevust') then
      raise exception 'Arvete jälgimise saab aktiveerida lõpetatud tööle.' using errcode='P0001';
    end if;
    if not new.amount_override then new.amount_cents:=round(j.estimated_total*100)::bigint; end if;
    new.payer_name:=coalesce(nullif(btrim(new.payer_name),''),j.payer_name);
    new.created_at:=clock_timestamp(); new.created_by:=auth.uid(); new.version:=1;
  else
    if new.job_id<>old.job_id then raise exception 'Arve seost tööga ei saa muuta.' using errcode='P0001'; end if;
    new.created_at:=old.created_at; new.created_by:=old.created_by; new.version:=old.version+1;
  end if;
  new.invoice_number:=nullif(btrim(new.invoice_number),'');
  new.updated_at:=clock_timestamp(); new.updated_by:=auth.uid();
  return new;
end; $$;
revoke all on function private.prepare_job_invoice() from public,anon,authenticated;

create function private.sync_draft_invoice_payer() returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.job_invoices set payer_name=new.payer_name
    where job_id=new.id and status='draft' and (payer_name is null or payer_name is not distinct from old.payer_name)
      and payer_name is distinct from new.payer_name;
  return new;
end; $$;
revoke all on function private.sync_draft_invoice_payer() from public,anon,authenticated;
create trigger sync_draft_invoice_payer after update of payer_name on public.jobs for each row
  when (new.payer_name is distinct from old.payer_name) execute function private.sync_draft_invoice_payer();
create or replace function public.save_priced_work_day(p_request_id uuid,p_date date,p_expected jsonb,p_day jsonb,p_jobs jsonb,p_workers jsonb)
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
    update public.jobs set customer_pricing=j->'customer_pricing',
      payer_name=case when j?'payer_name' then nullif(btrim(j->>'payer_name'),'') else payer_name end where id=(j->>'id')::uuid and work_day_id=day_id;
    if not found then raise exception 'Objekti ei leitud.' using errcode='P0001'; end if;
  end loop;
  return day_id;
end; $$;
revoke all on function public.save_priced_work_day(uuid,date,jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.save_priced_work_day(uuid,date,jsonb,jsonb,jsonb,jsonb) to authenticated;
