
create table public.photo_archive_connection (
 id boolean primary key default true check(id),
 account_id text, connected_by uuid references auth.users(id), connected_at timestamptz,
 last_run_at timestamptz, last_result jsonb,
 lock_id uuid, lock_until timestamptz
);
insert into public.photo_archive_connection(id) values(true);
alter table public.photo_archive_connection enable row level security;
revoke all on public.photo_archive_connection from public,anon,authenticated;
grant all on public.photo_archive_connection to service_role;
create table public.photo_archive_oauth (
 state_hash text primary key, user_id uuid not null references auth.users(id),
 verifier text not null, expires_at timestamptz not null
);
alter table public.photo_archive_oauth enable row level security;
revoke all on public.photo_archive_oauth from public,anon,authenticated;
grant all on public.photo_archive_oauth to service_role;
alter table public.job_photos
 add column dropbox_path text,
 add column dropbox_id text,
 add column dropbox_hash text,
 add column archived_at timestamptz,
 add column storage_removed_at timestamptz,
 add column archive_error text,
 add column archive_attempted_at timestamptz;
create index job_photos_archive_pending on public.job_photos(created_at) where storage_removed_at is null;
-- Credentials are encrypted in Vault. Only the server-side service role can call these RPCs.
create function public.photo_archive_secret(p_name text, p_value text default null)
returns text language plpgsql security definer set search_path='' as $$
declare sid uuid; result text;
begin
 if p_name not in ('photo_archive_refresh','photo_archive_cron') then raise exception 'Invalid secret'; end if;
 select id into sid from vault.secrets where name=p_name;
 if p_value is not null then
  if sid is null then perform vault.create_secret(p_value,p_name);
  else perform vault.update_secret(sid,p_value); end if;
  return null;
 end if;
 select decrypted_secret into result from vault.decrypted_secrets where name=p_name;
 return result;
end $$;
revoke all on function public.photo_archive_secret(text,text) from public,anon,authenticated;
grant execute on function public.photo_archive_secret(text,text) to service_role;
create function public.photo_archive_lock(p_id uuid, p_release boolean default false)
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if p_release then
  update public.photo_archive_connection set lock_id=null,lock_until=null where id and lock_id=p_id;
 else
  update public.photo_archive_connection set lock_id=p_id,lock_until=now()+interval '5 minutes'
  where id and (lock_until is null or lock_until<now());
 end if;
 get diagnostics n=row_count;
 return n=1;
end $$;
revoke all on function public.photo_archive_lock(uuid,boolean) from public,anon,authenticated;
grant execute on function public.photo_archive_lock(uuid,boolean) to service_role;
-- Archived records must not disappear through older direct table mutations.
create function private.guard_photo_archive() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('service_role','postgres','supabase_admin') then
  if TG_OP='DELETE' then return old; else return new; end if;
 end if;
 if TG_OP='DELETE' and old.dropbox_path is not null then raise exception 'Use photo archive delete action'; end if;
 if TG_OP='INSERT' then
  if new.dropbox_path is not null or new.dropbox_id is not null or new.archived_at is not null or new.storage_removed_at is not null then raise exception 'Server only archive fields'; end if;
 elsif TG_OP='UPDATE' then
  if row(new.dropbox_path,new.dropbox_id,new.dropbox_hash,new.archived_at,new.storage_removed_at,new.archive_error,new.archive_attempted_at)
    is distinct from row(old.dropbox_path,old.dropbox_id,old.dropbox_hash,old.archived_at,old.storage_removed_at,old.archive_error,old.archive_attempted_at)
    or (old.dropbox_path is not null and row(new.job_id,new.storage_path) is distinct from row(old.job_id,old.storage_path))
  then raise exception 'Server only archive fields'; end if;
 end if;
 if TG_OP='DELETE' then return old; else return new; end if;
end $$;
create trigger guard_photo_archive before insert or update or delete on public.job_photos for each row execute function private.guard_photo_archive();

create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$ begin
 if not exists(select 1 from vault.secrets where name='photo_archive_cron') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'photo_archive_cron');
 end if;
end $$;
-- The dedicated credential only authorizes the archive-old action, not account-wide service access.
select cron.schedule('photo-archive-hourly','17 * * * *',$cron$
 select net.http_post(
  url:='https://vplpaqcytzbcfpycoamw.supabase.co/functions/v1/photo-archive',
  headers:=jsonb_build_object('Content-Type','application/json','x-photo-archive-cron',
    (select decrypted_secret from vault.decrypted_secrets where name='photo_archive_cron')),
  body:='{"action":"archive-old"}'::jsonb,
  timeout_milliseconds:=110000
 ) where exists(select 1 from public.photo_archive_connection where id and account_id is not null);
$cron$);
