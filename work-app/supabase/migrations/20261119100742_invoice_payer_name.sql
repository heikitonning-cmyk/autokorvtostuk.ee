alter table public.job_invoices add column payer_name text check(length(payer_name)<=200);

create function public.save_job_invoice_with_payer(p_job_id uuid,p_version integer,p_status text,
 p_amount_cents bigint,p_amount_override boolean,p_invoice_number text,
 p_issued_on date,p_due_on date,p_paid_on date,p_payer_name text) returns jsonb
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
  if row(invoice.status,invoice.amount_cents,invoice.amount_override,invoice.invoice_number,invoice.issued_on,invoice.due_on,invoice.paid_on,invoice.payer_name)
    is not distinct from row(p_status,amount,p_amount_override,nullif(btrim(p_invoice_number),''),issued,due,paid,nullif(btrim(p_payer_name),'')) then return to_jsonb(invoice); end if;
  if p_version is distinct from invoice.version then raise exception 'Arvet on vahepeal muudetud. Värskenda lehte ja proovi uuesti.' using errcode='P0001'; end if;
  update public.job_invoices set status=p_status,amount_cents=amount,amount_override=p_amount_override,
    payer_name=nullif(btrim(p_payer_name),''),invoice_number=p_invoice_number,issued_on=issued,due_on=due,paid_on=paid where job_id=p_job_id returning * into invoice;
  return to_jsonb(invoice);
end; $$;
revoke all on function public.save_job_invoice_with_payer(uuid,integer,text,bigint,boolean,text,date,date,date,text) from public,anon;
grant execute on function public.save_job_invoice_with_payer(uuid,integer,text,bigint,boolean,text,date,date,date,text) to authenticated;
