-- Link legacy jobs to a saved customer site when the job object name uniquely matches the site name.
-- Preserve a deliberately entered address; only replace empty/generic labels such as "Pirita" or "Pirita neste".

update public.jobs j
set
  site_id = s.id,
  address = case
    when s.address is null then j.address
    when nullif(trim(coalesce(j.address, '')), '') is null then s.address
    when lower(trim(j.address)) = lower(trim(s.name)) then s.address
    when lower(trim(j.address)) = lower(trim(s.name || ' neste')) then s.address
    else j.address
  end
from public.customer_sites s
where j.site_id is null
  and j.customer_id = s.customer_id
  and s.active = true
  and nullif(trim(coalesce(j.object_name, '')), '') is not null
  and lower(trim(j.object_name)) = lower(trim(s.name))
  and not exists (
    select 1
    from public.customer_sites s2
    where s2.customer_id = j.customer_id
      and s2.active = true
      and s2.id <> s.id
      and lower(trim(s2.name)) = lower(trim(j.object_name))
  );
