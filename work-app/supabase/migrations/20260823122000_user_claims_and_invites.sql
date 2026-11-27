create table if not exists public.user_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text unique not null,
  role text not null default 'operator' check (role = 'operator'),
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.users(id),
  revoked_at timestamptz
);

create index if not exists user_invites_expires_idx on public.user_invites(expires_at);
create index if not exists user_invites_created_by_idx on public.user_invites(created_by);

alter table public.user_invites enable row level security;

revoke all on public.user_invites from anon;
grant select, insert, update, delete on public.user_invites to authenticated;

drop policy if exists "manager can manage user invites" on public.user_invites;
create policy "manager can manage user invites" on public.user_invites
for all to authenticated
using (private.is_manager())
with check (private.is_manager());

drop policy if exists "operator can read assigned jobs" on public.jobs;
drop policy if exists "operator can read free or own jobs" on public.jobs;
create policy "operator can read free or own jobs" on public.jobs
for select to authenticated using (
  private.current_app_role() = 'operator'
  and (
    operator_id = (select auth.uid())
    or (operator_id is null and status <> 'tuhistatud')
  )
);

drop policy if exists "operator can read assigned customers" on public.customers;
drop policy if exists "operator can read visible customers" on public.customers;
create policy "operator can read visible customers" on public.customers
for select to authenticated using (
  private.current_app_role() = 'operator'
  and exists (
    select 1
    from public.jobs j
    where j.customer_id = customers.id
      and (
        j.operator_id = (select auth.uid())
        or (j.operator_id is null and j.status <> 'tuhistatud')
      )
  )
);

create or replace function public.claim_job(p_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_job_id uuid;
begin
  if auth.uid() is null or private.current_app_role() not in ('operator', 'manager') then
    raise exception 'Kasutajal puudub õigus tööd võtta.' using errcode = 'P0001';
  end if;

  update public.jobs
  set operator_id = auth.uid()
  where id = p_job_id
    and operator_id is null
    and status <> 'tuhistatud'
  returning id into v_job_id;

  if v_job_id is null then
    raise exception 'Keegi teine jõudis selle töö juba võtta.' using errcode = 'P0001';
  end if;

  return v_job_id;
end;
$$;

revoke all on function public.claim_job(uuid) from public, anon;
grant execute on function public.claim_job(uuid) to authenticated;

create or replace function public.release_job(p_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_job_id uuid;
begin
  if auth.uid() is null or private.current_app_role() not in ('operator', 'manager') then
    raise exception 'Kasutajal puudub õigus tööd vabastada.' using errcode = 'P0001';
  end if;

  update public.jobs
  set operator_id = null
  where id = p_job_id
    and operator_id = auth.uid()
    and actual_start is null
    and status not in ('toob', 'tehtud', 'vajab_jareltegevust', 'tuhistatud')
  returning id into v_job_id;

  if v_job_id is null then
    raise exception 'Tööd ei saa vabastada: töö on juba alustatud või see ei kuulu sulle.' using errcode = 'P0001';
  end if;

  return v_job_id;
end;
$$;

revoke all on function public.release_job(uuid) from public, anon;
grant execute on function public.release_job(uuid) to authenticated;

create or replace function public.validate_user_invite(p_token_hash text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_invites i
    where i.token_hash = p_token_hash
      and i.role = 'operator'
      and i.used_at is null
      and i.revoked_at is null
      and i.expires_at > now()
  )
$$;

revoke all on function public.validate_user_invite(text) from public;
grant execute on function public.validate_user_invite(text) to anon, authenticated;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invite_id uuid;
  v_invite_hash text;
begin
  if coalesce(new.raw_user_meta_data->>'app_registration', '') <> 'worker_invite' then
    return new;
  end if;

  v_invite_hash := nullif(new.raw_user_meta_data->>'invite_hash', '');
  if v_invite_hash is null then
    raise exception 'Kutselink puudub või on vigane.' using errcode = 'P0001';
  end if;

  select i.id
  into v_invite_id
  from public.user_invites i
  where i.token_hash = v_invite_hash
    and i.role = 'operator'
    and i.used_at is null
    and i.revoked_at is null
    and i.expires_at > now()
  for update;

  if v_invite_id is null then
    raise exception 'Kutselink on vigane, aegunud või juba kasutatud.' using errcode = 'P0001';
  end if;

  insert into public.users (id, name, email, phone, role, active)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data->>'phone', ''),
    'operator',
    true
  );

  update public.user_invites
  set used_at = now(), used_by = new.id
  where id = v_invite_id;

  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();
