create schema if not exists private;

create or replace function private.current_app_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.users where id = auth.uid() and active = true
$$;

create or replace function private.is_manager()
returns boolean
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select coalesce(private.current_app_role() = 'manager', false)
$$;

grant usage on schema private to authenticated;
grant execute on function private.current_app_role() to authenticated;
grant execute on function private.is_manager() to authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.audit_job_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.job_events(job_id, actor_id, event_type, payload)
  values (
    coalesce(new.id, old.id),
    auth.uid(),
    lower(tg_op),
    jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
  );
  return coalesce(new, old);
end;
$$;

create or replace function private.audit_settings_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.job_events(job_id, actor_id, event_type, payload)
  values (
    null,
    auth.uid(),
    'settings_' || lower(tg_op),
    jsonb_build_object('key', coalesce(new.key, old.key), 'old', to_jsonb(old), 'new', to_jsonb(new))
  );
  return coalesce(new, old);
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.audit_job_change() from public, anon, authenticated;
revoke all on function private.audit_settings_change() from public, anon, authenticated;

drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at before update on public.users for each row execute function private.set_updated_at();
drop trigger if exists customers_updated_at on public.customers;
create trigger customers_updated_at before update on public.customers for each row execute function private.set_updated_at();
drop trigger if exists work_types_updated_at on public.work_types;
create trigger work_types_updated_at before update on public.work_types for each row execute function private.set_updated_at();
drop trigger if exists jobs_updated_at on public.jobs;
create trigger jobs_updated_at before update on public.jobs for each row execute function private.set_updated_at();
drop trigger if exists settings_updated_at on public.settings;
create trigger settings_updated_at before update on public.settings for each row execute function private.set_updated_at();
drop trigger if exists jobs_audit_trigger on public.jobs;
create trigger jobs_audit_trigger after insert or update or delete on public.jobs for each row execute function private.audit_job_change();
drop trigger if exists settings_audit_trigger on public.settings;
create trigger settings_audit_trigger after insert or update or delete on public.settings for each row execute function private.audit_settings_change();

drop policy if exists "authenticated can read own profile" on public.users;
create policy "authenticated can read own profile" on public.users
for select to authenticated using (id = auth.uid() or private.is_manager());
drop policy if exists "manager can manage users" on public.users;
create policy "manager can manage users" on public.users
for all to authenticated using (private.is_manager()) with check (private.is_manager());

drop policy if exists "manager can manage customers" on public.customers;
create policy "manager can manage customers" on public.customers
for all to authenticated using (private.is_manager()) with check (private.is_manager());

drop policy if exists "authenticated can read vehicles" on public.vehicles;
create policy "authenticated can read vehicles" on public.vehicles
for select to authenticated using (private.current_app_role() in ('manager','operator'));
drop policy if exists "manager can manage vehicles" on public.vehicles;
create policy "manager can manage vehicles" on public.vehicles
for all to authenticated using (private.is_manager()) with check (private.is_manager());

drop policy if exists "authenticated can read work types" on public.work_types;
create policy "authenticated can read work types" on public.work_types
for select to authenticated using (private.current_app_role() in ('manager','operator'));
drop policy if exists "manager can manage work types" on public.work_types;
create policy "manager can manage work types" on public.work_types
for all to authenticated using (private.is_manager()) with check (private.is_manager());

drop policy if exists "manager can manage settings" on public.settings;
create policy "manager can manage settings" on public.settings
for all to authenticated using (private.is_manager()) with check (private.is_manager());

drop policy if exists "manager can manage jobs" on public.jobs;
create policy "manager can manage jobs" on public.jobs
for all to authenticated using (private.is_manager()) with check (private.is_manager());

drop policy if exists "manager can manage job photos" on public.job_photos;
create policy "manager can manage job photos" on public.job_photos
for all to authenticated using (private.is_manager()) with check (private.is_manager());

drop policy if exists "manager can read job events" on public.job_events;
create policy "manager can read job events" on public.job_events
for select to authenticated using (private.is_manager());

drop policy if exists "manager can manage all stored job photos" on storage.objects;
create policy "manager can manage all stored job photos" on storage.objects
for all to authenticated
using (bucket_id = 'job-photos' and private.is_manager())
with check (bucket_id = 'job-photos' and private.is_manager());

drop function if exists public.is_manager();
drop function if exists public.current_app_role();
drop function if exists public.audit_job_change();
drop function if exists public.audit_settings_change();
drop function if exists public.set_updated_at();

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.users (id, name, email, role, active)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.email, ''),
    'operator',
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();
