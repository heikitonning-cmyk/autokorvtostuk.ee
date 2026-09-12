-- A stale legacy start/finish/confirm/cancel form must not overwrite completion.
-- The legacy billing/finish functions themselves remain unchanged.
create or replace function private.preserve_completed_job_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if old.status = 'completed' and new.status is distinct from old.status then
    raise exception 'Job is already completed' using errcode = '23514';
  end if;
  return new;
end;
$function$;
revoke all on function private.preserve_completed_job_status() from public, anon, authenticated;
create trigger jobs_preserve_completed_status
before update of status on public.jobs
for each row execute function private.preserve_completed_job_status();
