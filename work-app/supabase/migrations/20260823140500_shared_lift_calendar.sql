create or replace function public.shared_lift_calendar()
returns table (
  id uuid,
  customer_name text,
  work_type_name text,
  object_name text,
  address text,
  description text,
  status text,
  planned_date date,
  planned_time time,
  planned_end_time time,
  start_planned timestamptz,
  end_planned timestamptz,
  is_free boolean,
  is_mine boolean
)
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
begin
  if auth.uid() is null or private.current_app_role() not in ('operator', 'manager') then
    raise exception 'Kasutajal puudub õigus kalendrit vaadata.' using errcode = 'P0001';
  end if;

  return query
  select
    j.id,
    c.name as customer_name,
    wt.name as work_type_name,
    j.object_name,
    j.address,
    j.description,
    j.status,
    j.planned_date,
    j.planned_time,
    j.planned_end_time,
    j.start_planned,
    j.end_planned,
    j.operator_id is null as is_free,
    j.operator_id = auth.uid() as is_mine
  from public.jobs j
  left join public.customers c on c.id = j.customer_id
  left join public.work_types wt on wt.id = j.work_type_id
  where j.status <> 'tuhistatud'
    and (
      j.start_planned between now() - interval '2 days' and now() + interval '35 days'
      or j.planned_date between (timezone('Europe/Tallinn', now())::date - 2)
        and (timezone('Europe/Tallinn', now())::date + 35)
    )
  order by
    coalesce(j.start_planned, j.planned_date::timestamp at time zone 'Europe/Tallinn') asc nulls last,
    j.planned_time asc nulls last,
    j.created_at asc;
end;
$$;

revoke all on function public.shared_lift_calendar() from public, anon;
grant execute on function public.shared_lift_calendar() to authenticated;
