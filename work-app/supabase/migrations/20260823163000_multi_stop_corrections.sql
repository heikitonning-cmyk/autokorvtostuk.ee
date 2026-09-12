create or replace function public.correct_job_stop(
  p_stop_id uuid,
  p_actual_start timestamptz,
  p_actual_end timestamptz,
  p_completion_note text
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_job_id uuid;
  v_status text;
  v_old_start timestamptz;
  v_old_end timestamptz;
  v_old_note text;
  v_note text := nullif(btrim(coalesce(p_completion_note, '')), '');
begin
  if private.current_app_role() <> 'manager' then
    raise exception 'manager required';
  end if;

  if v_note is null then
    raise exception 'completion note required';
  end if;

  if p_actual_start is not null and p_actual_end is not null and p_actual_end < p_actual_start then
    raise exception 'end before start';
  end if;

  select job_id, status, actual_start, actual_end, completion_note
    into v_job_id, v_status, v_old_start, v_old_end, v_old_note
  from public.job_stops
  where id = p_stop_id
  for update;

  if not found or v_status not in ('done', 'skipped') then
    raise exception 'terminal stop required';
  end if;

  update public.job_stops
  set actual_start = p_actual_start,
      actual_end = p_actual_end,
      completion_note = v_note
  where id = p_stop_id;

  insert into public.job_events(job_id, actor_id, event_type, payload)
  values (
    v_job_id,
    auth.uid(),
    'stop_corrected',
    jsonb_build_object(
      'stop_id', p_stop_id,
      'old', jsonb_build_object('actual_start', v_old_start, 'actual_end', v_old_end, 'completion_note', v_old_note),
      'new', jsonb_build_object('actual_start', p_actual_start, 'actual_end', p_actual_end, 'completion_note', v_note)
    )
  );
end;
$$;

revoke all on function public.correct_job_stop(uuid, timestamptz, timestamptz, text) from public;
grant execute on function public.correct_job_stop(uuid, timestamptz, timestamptz, text) to authenticated;
