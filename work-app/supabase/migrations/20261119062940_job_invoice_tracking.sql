-- Invoice tracking only: no accounting integration, no legacy backfill.
create table public.job_invoices (
  job_id uuid primary key references public.jobs(id) on delete restrict,
  status text not null default 'draft' check(status in ('draft','unpaid','paid')),
  amount_cents bigint check(amount_cents between 0 and 99999999999),
  amount_override boolean not null default false,
  invoice_number text check(length(invoice_number)<=100),
  issued_on date, due_on date, paid_on date,
  version integer not null default 1,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.users(id),
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references public.users(id),
  check((status='draft' and issued_on is null and due_on is null and paid_on is null) or
    (status='unpaid' and amount_cents is not null and issued_on is not null and due_on is not null and paid_on is null) or
    (status='paid' and amount_cents is not null and issued_on is not null and due_on is not null and paid_on is not null)),
  check(due_on is null or due_on>=issued_on),
  check(paid_on is null or paid_on>=issued_on),
  check(issued_on is null or issued_on between '2000-01-01' and '2099-12-31'),
  check(due_on is null or due_on between '2000-01-01' and '2099-12-31'),
  check(paid_on is null or paid_on between '2000-01-01' and '2099-12-31')
);
create index job_invoices_unpaid_due on public.job_invoices(due_on) where status='unpaid';
create table public.job_invoice_history (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.job_invoices(job_id) on delete restrict,
  changed_at timestamptz not null default clock_timestamp(),
  changed_by uuid references public.users(id),
  previous_data jsonb, new_data jsonb not null
);
create index job_invoice_history_job on public.job_invoice_history(job_id,changed_at);
alter table public.job_invoices enable row level security;
alter table public.job_invoice_history enable row level security;
revoke all on public.job_invoices,public.job_invoice_history from public,anon,authenticated;
grant select,insert,update on public.job_invoices to authenticated;
grant select on public.job_invoice_history to authenticated;
create policy "Managers track invoices" on public.job_invoices for all to authenticated
  using((select private.is_manager())) with check((select private.is_manager()));
create policy "Managers read invoice history" on public.job_invoice_history for select to authenticated
  using((select private.is_manager()));

create function private.prepare_job_invoice() returns trigger
language plpgsql security invoker set search_path='' as $$
declare j public.jobs%rowtype;
begin
  if tg_op='INSERT' then
    select * into j from public.jobs where id=new.job_id;
    if not found or j.status not in ('completed','tehtud','vajab_jareltegevust') then
      raise exception 'Arvete jälgimise saab aktiveerida lõpetatud tööle.' using errcode='P0001';
    end if;
    if not new.amount_override then new.amount_cents:=round(j.estimated_total*100)::bigint; end if;
    new.created_at:=clock_timestamp(); new.created_by:=auth.uid(); new.version:=1;
  else
    if new.job_id<>old.job_id then raise exception 'Arve seost tööga ei saa muuta.' using errcode='P0001'; end if;
    new.created_at:=old.created_at; new.created_by:=old.created_by; new.version:=old.version+1;
  end if;
  new.invoice_number:=nullif(btrim(new.invoice_number),'');
  new.updated_at:=clock_timestamp(); new.updated_by:=auth.uid();
  return new;
end; $$;
revoke all on function private.prepare_job_invoice() from public,anon,authenticated;
create trigger prepare_job_invoice before insert or update on public.job_invoices
  for each row execute function private.prepare_job_invoice();

create function private.audit_job_invoice() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.job_invoice_history(job_id,changed_by,previous_data,new_data)
    values(new.job_id,auth.uid(),case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
  return new;
end; $$;
revoke all on function private.audit_job_invoice() from public,anon,authenticated;
create trigger audit_job_invoice after insert or update on public.job_invoices
  for each row execute function private.audit_job_invoice();

create function private.track_completed_job_invoice() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('completed','tehtud','vajab_jareltegevust') and
    (tg_op='INSERT' or old.status not in ('completed','tehtud','vajab_jareltegevust')) then
    insert into public.job_invoices(job_id) values(new.id) on conflict(job_id) do nothing;
  end if;
  -- Drafts follow the existing displayed job amount until overridden or issued.
  if tg_op='UPDATE' and new.estimated_total is distinct from old.estimated_total then
    update public.job_invoices set amount_cents=round(new.estimated_total*100)::bigint
      where job_id=new.id and status='draft' and not amount_override
        and amount_cents is distinct from round(new.estimated_total*100)::bigint;
  end if;
  return new;
end; $$;
revoke all on function private.track_completed_job_invoice() from public,anon,authenticated;
create trigger track_completed_job_invoice after insert or update on public.jobs
  for each row execute function private.track_completed_job_invoice();

create function public.activate_job_invoice(p_job_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare invoice public.job_invoices%rowtype;
begin
  if not coalesce(private.is_manager(),false) then raise exception 'Puudub juhataja õigus.' using errcode='42501'; end if;
  perform 1 from public.jobs where id=p_job_id for update;
  insert into public.job_invoices(job_id) values(p_job_id) on conflict(job_id) do nothing;
  select * into invoice from public.job_invoices where job_id=p_job_id;
  return to_jsonb(invoice);
end; $$;
revoke all on function public.activate_job_invoice(uuid) from public,anon;
grant execute on function public.activate_job_invoice(uuid) to authenticated;

create function public.save_job_invoice(p_job_id uuid,p_version integer,p_status text,
 p_amount_cents bigint,p_amount_override boolean,p_invoice_number text,
 p_issued_on date,p_due_on date,p_paid_on date) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare invoice public.job_invoices%rowtype; job_amount bigint; issued date; due date; paid date; amount bigint;
begin
  if not coalesce(private.is_manager(),false) then raise exception 'Puudub juhataja õigus.' using errcode='42501'; end if;
  select round(estimated_total*100)::bigint into job_amount from public.jobs where id=p_job_id for update;
  select * into invoice from public.job_invoices where job_id=p_job_id for update;
  if not found then raise exception 'Aktiveeri kõigepealt arve jälgimine.' using errcode='P0001'; end if;
  if p_status is null or p_status not in ('draft','unpaid','paid') or p_amount_override is null then
    raise exception 'Kontrolli arve olekut ja summat.' using errcode='P0001';
  end if;
  if invoice.status='draft' and p_status='paid' then
    raise exception 'Märgi esmalt arve esitatuks.' using errcode='P0001';
  end if;
  amount:=case when p_amount_override then p_amount_cents when invoice.status='draft' or p_status='draft' then job_amount else invoice.amount_cents end;
  if p_status<>'draft' then
    issued:=coalesce(p_issued_on,invoice.issued_on,(now() at time zone 'Europe/Tallinn')::date);
    due:=coalesce(p_due_on,issued+7);
    if p_status='paid' then paid:=coalesce(p_paid_on,invoice.paid_on,(now() at time zone 'Europe/Tallinn')::date); end if;
  end if;
  if row(invoice.status,invoice.amount_cents,invoice.amount_override,invoice.invoice_number,invoice.issued_on,invoice.due_on,invoice.paid_on)
    is not distinct from row(p_status,amount,p_amount_override,nullif(btrim(p_invoice_number),''),issued,due,paid) then return to_jsonb(invoice); end if;
  if p_version is distinct from invoice.version then raise exception 'Arvet on vahepeal muudetud. Värskenda lehte ja proovi uuesti.' using errcode='P0001'; end if;
  update public.job_invoices set status=p_status,amount_cents=amount,amount_override=p_amount_override,
    invoice_number=p_invoice_number,issued_on=issued,due_on=due,paid_on=paid where job_id=p_job_id returning * into invoice;
  return to_jsonb(invoice);
end; $$;
revoke all on function public.save_job_invoice(uuid,integer,text,bigint,boolean,text,date,date,date) from public,anon;
grant execute on function public.save_job_invoice(uuid,integer,text,bigint,boolean,text,date,date,date) to authenticated;
