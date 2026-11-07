-- The manager selects the operator. Existing assignments and work history stay intact.
revoke all on function public.claim_job(uuid) from public, anon, authenticated;
revoke all on function public.release_job(uuid) from public, anon, authenticated;

-- Enforce the same rule for direct API writes and legacy SECURITY DEFINER RPCs.
create function private.guard_job_assignment() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if (tg_op='INSERT' and new.operator_id is not null)
    or (tg_op='UPDATE' and new.operator_id is distinct from old.operator_id) then
    if auth.uid() is null or not coalesce(private.is_manager(),false) then
      raise exception 'Tööle määrab juhi juhataja.' using errcode='42501';
    end if;
    if tg_op='UPDATE' and old.status not in ('uus','kinnitatud','teel','toob') then
      raise exception 'Lõpetatud või tühistatud töö juhti ei saa muuta.' using errcode='23514';
    end if;
    if new.operator_id is not null and not exists (
      select 1 from public.users where id=new.operator_id and active and role in ('operator','manager')
    ) then
      raise exception 'Vali aktiivne juht.' using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_job_assignment() from public,anon,authenticated;
create trigger jobs_guard_assignment before insert or update of operator_id on public.jobs
for each row execute function private.guard_job_assignment();

create function public.assign_job_operator(p_job_id uuid,p_operator_id uuid,p_expected_updated_at timestamptz)
returns uuid language plpgsql security invoker set search_path='' as $$
declare job public.jobs%rowtype;
begin
  if auth.uid() is null or not coalesce(private.is_manager(),false) then
    raise exception 'Tööle määrab juhi juhataja.' using errcode='42501';
  end if;
  select * into job from public.jobs where id=p_job_id for update;
  if not found or p_expected_updated_at is null or job.updated_at is distinct from p_expected_updated_at then
    raise exception 'Töö on vahepeal muutunud.' using errcode='P0001';
  end if;
  if job.status not in ('uus','kinnitatud','teel','toob') then
    raise exception 'Lõpetatud või tühistatud töö juhti ei saa muuta.' using errcode='23514';
  end if;
  if p_operator_id is not null and not exists (
    select 1 from public.users where id=p_operator_id and active and role in ('operator','manager')
  ) then
    raise exception 'Vali aktiivne juht.' using errcode='23514';
  end if;
  update public.jobs set operator_id=p_operator_id where id=p_job_id;
  return p_job_id;
end;
$$;
revoke all on function public.assign_job_operator(uuid,uuid,timestamptz) from public,anon;
grant execute on function public.assign_job_operator(uuid,uuid,timestamptz) to authenticated;
