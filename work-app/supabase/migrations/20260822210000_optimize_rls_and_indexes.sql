create index if not exists job_events_actor_idx on public.job_events(actor_id);
create index if not exists job_photos_uploaded_by_idx on public.job_photos(uploaded_by);
create index if not exists jobs_created_by_idx on public.jobs(created_by);
create index if not exists jobs_vehicle_idx on public.jobs(vehicle_id);
create index if not exists jobs_work_type_idx on public.jobs(work_type_id);
create index if not exists settings_updated_by_idx on public.settings(updated_by);

drop policy if exists "authenticated can read own profile" on public.users;
create policy "authenticated can read own profile" on public.users
for select to authenticated using (id = (select auth.uid()) or private.is_manager());

drop policy if exists "operator can read assigned customers" on public.customers;
create policy "operator can read assigned customers" on public.customers
for select to authenticated using (
  exists (select 1 from public.jobs j where j.customer_id = customers.id and j.operator_id = (select auth.uid()))
);

drop policy if exists "operator can read assigned jobs" on public.jobs;
create policy "operator can read assigned jobs" on public.jobs
for select to authenticated using (operator_id = (select auth.uid()));

drop policy if exists "operator can update assigned jobs" on public.jobs;
create policy "operator can update assigned jobs" on public.jobs
for update to authenticated using (operator_id = (select auth.uid())) with check (operator_id = (select auth.uid()));

drop policy if exists "operator can manage assigned job photos" on public.job_photos;
create policy "operator can manage assigned job photos" on public.job_photos
for all to authenticated
using (exists (select 1 from public.jobs j where j.id = job_photos.job_id and j.operator_id = (select auth.uid())))
with check (uploaded_by = (select auth.uid()) and exists (select 1 from public.jobs j where j.id = job_photos.job_id and j.operator_id = (select auth.uid())));

drop policy if exists "operator can read assigned job events" on public.job_events;
create policy "operator can read assigned job events" on public.job_events
for select to authenticated using (
  job_id is not null and exists (select 1 from public.jobs j where j.id = job_events.job_id and j.operator_id = (select auth.uid()))
);

drop policy if exists "operator can manage assigned job photos" on storage.objects;
create policy "operator can manage assigned job photos" on storage.objects
for all to authenticated
using (
  bucket_id = 'job-photos'
  and exists (
    select 1 from public.job_photos p
    join public.jobs j on j.id = p.job_id
    where p.storage_path = name and j.operator_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'job-photos'
  and split_part(name, '/', 1) in (
    select j.id::text from public.jobs j where j.operator_id = (select auth.uid())
  )
);
