create or replace function public.update_job_stop_description(
  p_stop_id uuid,
  p_description text,
  p_expected_revision bigint
)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_job_id uuid;
  v_old_description text;
  v_new_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_new_revision bigint;
begin
  if private.current_app_role() not in ('operator', 'manager') then
    raise exception 'not allowed';
  end if;

  select s.job_id, s.description
    into v_job_id, v_old_description
  from public.job_stops s
  join public.jobs j on j.id = s.job_id
  where s.id = p_stop_id
    and s.status = 'pending'
    and j.status not in ('tehtud', 'vajab_jareltegevust', 'tuhistatud')
    and j.route_revision = p_expected_revision
  for update of s, j;

  if not found then
    raise exception 'stale route revision';
  end if;

  update public.job_stops
  set description = v_new_description
  where id = p_stop_id and job_id = v_job_id and status = 'pending';

  update public.jobs
  set route_revision = route_revision + 1
  where id = v_job_id
  returning route_revision into v_new_revision;

  insert into public.job_events(job_id, actor_id, event_type, payload)
  values (
    v_job_id,
    auth.uid(),
    'stop_description_changed',
    jsonb_build_object(
      'stop_id', p_stop_id,
      'old_description', v_old_description,
      'new_description', v_new_description,
      'revision', v_new_revision
    )
  );

  return v_new_revision;
end;
$$;

revoke all on function public.update_job_stop_description(uuid, text, bigint) from public;
grant execute on function public.update_job_stop_description(uuid, text, bigint) to authenticated;
