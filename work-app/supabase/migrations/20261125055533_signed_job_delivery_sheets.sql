-- Signed snapshots are append-only. Never cascade a job deletion into evidence loss.
create table public.job_delivery_sheets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete restrict,
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<100000),
  signature jsonb not null check (jsonb_typeof(signature)='array' and jsonb_array_length(signature) between 1 and 100 and octet_length(signature::text)<250000),
  created_by uuid not null default auth.uid() references public.users(id),
  signed_at timestamptz not null default now()
);
create index job_delivery_sheets_created_by_idx on public.job_delivery_sheets(created_by);
alter table public.job_delivery_sheets enable row level security;
revoke all on public.job_delivery_sheets from anon,authenticated;
grant select on public.job_delivery_sheets to authenticated;
grant insert (job_id,snapshot,signature,created_by) on public.job_delivery_sheets to authenticated;
create policy "active users read accessible job sheets" on public.job_delivery_sheets for select to authenticated
using ((select private.current_app_role()) in ('manager','operator') and exists (select 1 from public.jobs j where j.id=job_id));
create policy "active users sign accessible jobs" on public.job_delivery_sheets for insert to authenticated
with check (created_by=(select auth.uid()) and (select private.current_app_role()) in ('manager','operator') and exists (select 1 from public.jobs j where j.id=job_id and j.status<>'tuhistatud'));
comment on table public.job_delivery_sheets is 'Customer-signed work and price snapshot. No UPDATE or DELETE grants. Signing does not issue an invoice or alter payroll.';
