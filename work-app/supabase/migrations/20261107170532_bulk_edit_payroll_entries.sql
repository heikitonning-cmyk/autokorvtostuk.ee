-- Atomic corrections of explicitly selected completed entries. NULL means keep
-- that field. Dates, workers, labels, notes and historical rates are untouched.
create function public.bulk_edit_payroll_entries(
  p_entries jsonb, p_start_minute integer default null, p_end_minute integer default null,
  p_next_day boolean default null, p_break_minutes integer default null
) returns integer language plpgsql security invoker set search_path = '' as $$
declare
  selected record; existing public.payroll_entries%rowtype;
  elapsed integer; affected integer := 0;
begin
  if not coalesce(private.is_manager(),false) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then raise exception 'Invalid entries' using errcode = '23514'; end if;
  if jsonb_array_length(p_entries) not between 1 and 100
    or (p_start_minute is null and p_end_minute is null and p_break_minutes is null)
    or (p_start_minute is not null and p_start_minute not between 0 and 1439)
    or (p_end_minute is not null and p_end_minute not between 0 and 1439)
    or (p_break_minutes is not null and p_break_minutes not between 0 and 1439)
    or ((p_end_minute is null) <> (p_next_day is null)) then
    raise exception 'Invalid patch' using errcode = '23514';
  end if;
  if (select count(distinct id) from jsonb_to_recordset(p_entries) as x(id uuid, updated_at timestamptz)) <> jsonb_array_length(p_entries) then
    raise exception 'Invalid selection' using errcode = '23514';
  end if;
  -- Lock in a stable order and validate every snapshot before updating anything.
  for selected in select * from jsonb_to_recordset(p_entries) as x(id uuid, updated_at timestamptz) order by id loop
    select * into existing from public.payroll_entries where id=selected.id for update;
    if not found or existing.end_minute is null or selected.updated_at is null or existing.updated_at <> selected.updated_at then
      raise exception 'Entry changed' using errcode = 'P0001';
    end if;
    elapsed := coalesce(p_end_minute,existing.end_minute) + case when coalesce(p_next_day,existing.next_day) then 1440 else 0 end - coalesce(p_start_minute,existing.start_minute);
    if elapsed not between 1 and 1440 or elapsed <= coalesce(p_break_minutes,existing.break_minutes) then
      raise exception 'Invalid elapsed time' using errcode = 'P0002';
    end if;
  end loop;
  update public.payroll_entries e set
    start_minute=coalesce(p_start_minute,e.start_minute), end_minute=coalesce(p_end_minute,e.end_minute),
    next_day=coalesce(p_next_day,e.next_day), break_minutes=coalesce(p_break_minutes,e.break_minutes)
  where e.id in (select x.id from jsonb_to_recordset(p_entries) as x(id uuid, updated_at timestamptz));
  get diagnostics affected = row_count;
  if affected <> jsonb_array_length(p_entries) then raise exception 'Entry changed' using errcode = 'P0001'; end if;
  return affected;
end;
$$;
revoke all on function public.bulk_edit_payroll_entries(jsonb,integer,integer,boolean,integer) from public, anon;
grant execute on function public.bulk_edit_payroll_entries(jsonb,integer,integer,boolean,integer) to authenticated;
