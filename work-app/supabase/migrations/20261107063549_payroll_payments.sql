-- Records payments already made; no bank transfer or tax calculation.
create table public.payroll_payments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.payroll_employees(id) on delete restrict,
  paid_date date not null check (paid_date between '2000-01-01' and '2099-12-31'),
  amount_cents integer not null check (amount_cents between 1 and 99999999),
  note text not null default '' check (length(note) <= 1000),
  voided_at timestamptz,
  created_by uuid references public.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payroll_payments_employee_idx on public.payroll_payments(employee_id);
create index payroll_payments_date_idx on public.payroll_payments(paid_date,id);
alter table public.payroll_payments enable row level security;
revoke all on public.payroll_payments from anon, authenticated;
grant select,insert,update on public.payroll_payments to authenticated;
create policy "manager manages payroll payments" on public.payroll_payments
  for all to authenticated using ((select private.is_manager()))
  with check ((select private.is_manager()));

create function private.prepare_payroll_payment() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.paid_date > (statement_timestamp() at time zone 'Europe/Tallinn')::date then
    raise exception 'Makse kuupäev ei saa olla tulevikus.' using errcode='23514';
  end if;
  if tg_op='INSERT' then
    new.created_by:=auth.uid();
    new.voided_at:=null;
  else
    if old.voided_at is not null then raise exception 'Makse on tühistatud.' using errcode='P0001'; end if;
    new.created_by:=old.created_by;
    new.created_at:=old.created_at;
    if new.voided_at is not null then
      -- Cancellation preserves the original payment record for history.
      new.employee_id:=old.employee_id; new.paid_date:=old.paid_date;
      new.amount_cents:=old.amount_cents; new.note:=old.note;
      new.voided_at:=clock_timestamp();
    end if;
  end if;
  new.updated_at:=clock_timestamp();
  return new;
end;
$$;
revoke all on function private.prepare_payroll_payment() from public,anon,authenticated;
create trigger prepare_payroll_payment before insert or update on public.payroll_payments
  for each row execute function private.prepare_payroll_payment();

-- Stable client-generated ID makes connection retries and double submits safe.
create function public.save_payroll_payment(
  p_id uuid,p_employee_id uuid,p_paid_date date,p_amount_cents integer,
  p_note text default '',p_expected_version timestamptz default null
) returns uuid language plpgsql security invoker set search_path='' as $$
declare saved_id uuid; existing public.payroll_payments%rowtype;
begin
  if not coalesce(private.is_manager(),false) then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_id is null then raise exception 'Missing payment ID' using errcode='23514'; end if;
  if p_expected_version is null then
    insert into public.payroll_payments(id,employee_id,paid_date,amount_cents,note)
      values(p_id,p_employee_id,p_paid_date,p_amount_cents,coalesce(p_note,''))
      on conflict(id) do nothing returning id into saved_id;
    if saved_id is null then
      select * into existing from public.payroll_payments where id=p_id for update;
      if not found or existing.voided_at is not null
        or existing.employee_id is distinct from p_employee_id
        or existing.paid_date is distinct from p_paid_date
        or existing.amount_cents is distinct from p_amount_cents
        or existing.note is distinct from coalesce(p_note,'') then
        raise exception 'Makse on vahepeal muutunud.' using errcode='P0001';
      end if;
    end if;
  else
    update public.payroll_payments set employee_id=p_employee_id,paid_date=p_paid_date,
      amount_cents=p_amount_cents,note=coalesce(p_note,'')
      where id=p_id and updated_at=p_expected_version and voided_at is null returning id into saved_id;
    if saved_id is null then raise exception 'Makse on vahepeal muutunud.' using errcode='P0001'; end if;
  end if;
  return p_id;
end;
$$;
revoke all on function public.save_payroll_payment(uuid,uuid,date,integer,text,timestamptz) from public,anon;
grant execute on function public.save_payroll_payment(uuid,uuid,date,integer,text,timestamptz) to authenticated;

-- Aggregate earnings and payments separately, avoiding N x M multiplication.
-- Whole-history balances intentionally carry across months; a negative balance
-- is an advance for that employee, never offset against another employee's wages.
create function public.payroll_balances()
returns table(employee_id uuid,earned_cents bigint,paid_cents bigint,balance_cents bigint)
language sql stable security invoker set search_path='' as $$
  select e.id,coalesce(w.earned,0),coalesce(p.paid,0),coalesce(w.earned,0)-coalesce(p.paid,0)
  from public.payroll_employees e
  left join (select t.employee_id,sum(t.wage_cents) earned from public.payroll_entries t
    where t.end_minute is not null group by t.employee_id) w on w.employee_id=e.id
  left join (select t.employee_id,sum(t.amount_cents) paid from public.payroll_payments t
    where t.voided_at is null group by t.employee_id) p on p.employee_id=e.id
  where (select private.is_manager());
$$;
revoke all on function public.payroll_balances() from public,anon;
grant execute on function public.payroll_balances() to authenticated;
