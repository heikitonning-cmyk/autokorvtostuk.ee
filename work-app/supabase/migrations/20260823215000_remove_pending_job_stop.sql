create or replace function public.remove_job_stop(
  p_job_id uuid,
  p_stop_id uuid,
  p_expected_revision bigint
)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_revision bigint;
  v_new_revision bigint;
  v_sequence integer;
  v_stop record;
  v_index integer := 0;
begin
  if private.current_app_role() not in ('operator', 'manager') then
    raise exception 'not allowed';
  end if;

  select route_revision
    into v_revision
  from public.jobs
  where id = p_job_id
    and status not in ('tehtud', 'vajab_jareltegevust', 'tuhistatud')
    and route_revision = p_expected_revision
  for update;

  if not found then
    raise exception 'stale route revision';
  end if;

  delete from public.job_stops
  where id = p_stop_id
    and job_id = p_job_id
    and status = 'pending'
  returning sequence_no into v_sequence;

  if not found then
    raise exception 'stop cannot be removed';
  end if;

  update public.job_stops
  set sequence_no = sequence_no + 1000000
  where job_id = p_job_id;

  for v_stop in
    select id
    from public.job_stops
    where job_id = p_job_id
    order by sequence_no
  loop
    v_index := v_index + 1;
    update public.job_stops
    set sequence_no = v_index
    where id = v_stop.id;
  end loop;

  update public.jobs
  set route_revision = route_revision + 1
  where id = p_job_id
  returning route_revision into v_new_revision;

  insert into public.job_events(job_id, actor_id, event_type, payload)
  values (
    p_job_id,
    auth.uid(),
    'stop_removed',
    jsonb_build_object('stop_id', p_stop_id, 'sequence_no', v_sequence, 'revision', v_new_revision)
  );

  return v_new_revision;
end;
$$;

revoke all on function public.remove_job_stop(uuid, uuid, bigint) from public;
grant execute on function public.remove_job_stop(uuid, uuid, bigint) to authenticated;
