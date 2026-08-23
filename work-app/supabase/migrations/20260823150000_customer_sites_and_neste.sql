-- Reusable customer locations and the initial Neste station master data.

create table if not exists public.customer_sites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  name text not null,
  external_code text,
  address text,
  city text,
  county text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  requires_lift boolean,
  service_notes text,
  active boolean not null default true,
  source text,
  source_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customer_sites_customer_external_code_uq
on public.customer_sites(customer_id, external_code)
where external_code is not null;

create index if not exists customer_sites_customer_idx
on public.customer_sites(customer_id, active, name);

alter table public.jobs
  add column if not exists site_id uuid references public.customer_sites(id);

create index if not exists jobs_site_idx on public.jobs(site_id);

drop trigger if exists customer_sites_updated_at on public.customer_sites;
create trigger customer_sites_updated_at
before update on public.customer_sites
for each row execute function private.set_updated_at();

alter table public.customer_sites enable row level security;

grant select, insert, update, delete on public.customer_sites to authenticated;

drop policy if exists "manager can manage customer sites" on public.customer_sites;
create policy "manager can manage customer sites" on public.customer_sites
for all to authenticated
using (private.is_manager())
with check (private.is_manager());

drop policy if exists "operator can read customer sites" on public.customer_sites;
create policy "operator can read customer sites" on public.customer_sites
for select to authenticated
using (private.current_app_role() = 'operator');

drop policy if exists "operator can add manual customer sites" on public.customer_sites;
create policy "operator can add manual customer sites" on public.customer_sites
for insert to authenticated
with check (
  private.current_app_role() = 'operator'
  and source = 'manual'
  and exists (select 1 from public.customers c where c.id = customer_id)
);

-- Reuse the existing Neste customer. Create it only if it does not yet exist.
insert into public.customers(type, name, notes)
select 'company', 'Neste', 'Neste püsiasukohad ja hooldustööd'
where not exists (
  select 1 from public.customers where lower(trim(name)) = 'neste'
);

with neste_customer as (
  select id
  from public.customers
  where lower(trim(name)) = 'neste'
  order by created_at
  limit 1
), neste_sites(external_code, name, address, requires_lift, service_notes, source_ref) as (
  values
    ('NESTE-001','Vesse','Peterburi tee 52, Tallinn',false,'Puud: ei ole puid.','1'),
    ('NESTE-002','Smuuli','Punane 43, Tallinn',false,'Puud: ei ole puid.','2'),
    ('NESTE-003','Peterburi tee','Mustakivi tee 2, Tallinn',true,'Puud: ei ole puid.','3'),
    ('NESTE-004','Suur-Sõjamäe D-jaam','Suur-Sõjamäe 35c, Tallinn',false,'Väike veoka; tõstukit ei ole vaja.','4'),
    ('NESTE-005','Luige','Luige alevik, Luige',true,'Puud: ei ole puid.','5'),
    ('NESTE-006','Jüri','Uus-Ringi tee 1, Jüri',true,'Puud: ei ole puid.','6'),
    ('NESTE-007','Peetri','Veesaare tee 2, Peetri',true,'Puud eemal.','7'),
    ('NESTE-008','Laagri','Pärnu mnt 556c, Tallinn/Laagri',true,'Puud: ei ole puid.','8'),
    ('NESTE-009','Ringtee','Lääneringtee 14, Tartu',true,'Puud eemal.','9'),
    ('NESTE-010','Lõunakeskus','Valguse 2, Räni/Tartu',true,'Puud: ei ole puid.','10'),
    ('NESTE-011','Ropka','Võru 244, Tartu',true,'Puud lähedal.','11'),
    ('NESTE-012','Jõhvi','Ristiku tn 2c, Jõhvi',true,'Puud; üks suur puu lähedal.','12'),
    ('NESTE-013','Ahtme','Puru tee 81, Ahtme',true,'Puud eemal.','13'),
    ('NESTE-014','Sillamäe','Tallinna mnt 9b, Sillamäe',true,'Puud: ei ole puid.','14'),
    ('NESTE-015','Keila D-jaam','Keki 1, Keila',false,'Väike veoka; tõstukit ei ole vaja.','15'),
    ('NESTE-016','Piiri','Piiri 14a, Keila',true,'Puud: ei ole puid.','16'),
    ('NESTE-017','Rocca al Mare','Paldiski mnt 98, Tallinn',false,'Puud eemal; tõstukit ei ole vaja.','17'),
    ('NESTE-018','Kadaka','Kadaka tee 60, Tallinn',false,'Puud; tõstukit ei ole vaja.','18'),
    ('NESTE-019','Võru','Jüri 83a, Võru',true,'Puud: ei ole puid.','19'),
    ('NESTE-020','Võru D','Pikk 6, Võru',false,'Väike veoka; tõstukit ei ole vaja.','20'),
    ('NESTE-021','Kuressaare','Tallinna tn 63a, Kuressaare',true,'Puud eemal.','21'),
    ('NESTE-022','Tondi','Tammsaare tee 64a, Tallinn',true,'Puud: ei ole puid.','22'),
    ('NESTE-023','Sõpruse 2','Sõpruse pst 178, Tallinn',true,'Puud lähedal.','23'),
    ('NESTE-024','Põhja pst','Põhja pst 17a / Soo tn 1, Tallinn',true,'Paar puud lähedal.','24'),
    ('NESTE-025','Linnamäe','Linnamäe tee 40, Tallinn',true,'Puud: ei ole puid.','25'),
    ('NESTE-026','Riia mnt','Riia mnt 110c, Pärnu',true,'Puud eemal.','26'),
    ('NESTE-027','Niidu','Niidu 9, Pärnu',true,'Puud: ei ole puid.','27'),
    ('NESTE-028','Jannseni','Jannseni 1, Pärnu',true,'Puud lähedal.','28'),
    ('NESTE-029','Mäo','Lõigendi, Mäo küla, Mäo',true,'Puud: ei ole puid.','29'),
    ('NESTE-030','Jõgeva','Suur 95, Jõgeva',true,'Puud eemal.','30'),
    ('NESTE-031','Rakvere','Laada 24, Rakvere',true,'Puud: ei ole puid.','31'),
    ('NESTE-032','Rapla','Tallinna mnt 1, Rapla',true,'Puud: ei ole puid.','32'),
    ('NESTE-033','Tallinna mnt','Tallinna mnt 97d, Viljandi',true,'Puud lähedal.','33'),
    ('NESTE-034','Männimäe','Riia mnt 18, Viljandi',true,'Puud: ei ole puid.','34'),
    ('NESTE-035','Haapsalu','Lihula mnt 29, Haapsalu',true,'Puud: ei ole puid.','35'),
    ('NESTE-036','Hiiumaa','Nurme, Linnumäe küla, Hiiumaa',true,'Puud: ei ole puid.','36'),
    ('NESTE-037','Narva','Tallinna mnt 55a, Narva',true,'Puud lähedal.','37'),
    ('NESTE-038','Kreenholmi','Juuli 1a, Narva',true,'Puud: ei ole puid.','38'),
    ('NESTE-039','Pähklimäe','Kivilinna 2, Narva',true,'Puud: ei ole puid.','39'),
    ('NESTE-040','Anne','Kalda tee 1b, Tartu',true,'Puud: ei ole puid.','40'),
    ('NESTE-041','Turu','Kuu 51, Tartu',true,'Puud; üks suur puu lähedal.','41'),
    ('NESTE-042','Narva mnt','Narva mnt 29, Tartu',true,'Puud lähedal.','42'),
    ('NESTE-043','Aardla','Võru 172, Tartu',true,'Puud lähedal.','43'),
    ('NESTE-044','Valga','Raja 5, Valga',true,'Puud eemal.','44'),
    ('NESTE-045','Männiku','Männiku tee 99, Tallinn',true,'Puud eemal.','45'),
    ('NESTE-046','Järve','Pärnu mnt 141a, Tallinn',true,'Puud eemal.','46'),
    ('NESTE-047','Sõpruse','Sõpruse pst 155, Tallinn',true,'Puud lähedal.','47'),
    ('NESTE-048','Marja','Mustamäe tee 39, Tallinn',true,'Puud lähedal.','48'),
    ('NESTE-049','Pääsküla','Pärnu mnt 453e, Tallinn',false,'Puud: ei ole puid; tõstukit ei ole vaja.','49'),
    ('NESTE-050','Merimetsa','Paldiski mnt 54, Tallinn',true,'Puid ei ole.','50'),
    ('NESTE-051','Sõle','Sõle 25a, Tallinn',false,'Pigem ei ole puid; tõstukit ei ole vaja.','51'),
    ('NESTE-052','Suur-Ameerika','Suur-Ameerika 49 / Koidu 47, Tallinn',true,'Puud lähedal.','52'),
    ('NESTE-053','Juhkentali','Juhkentali 37/39, Tallinn',true,'Puud eemal.','53'),
    ('NESTE-054','Laagna','Ümera 35, Tallinn',true,'Lähedal vaid okaspuud.','54'),
    ('NESTE-055','Läänemere','Läänemere tee 2b, Tallinn',true,'Puud: ei ole puid.','55'),
    ('NESTE-056','Viimsi','Pargi tee 24, Viimsi',true,'Puud eemal.','56'),
    ('NESTE-057','Haljala','Metsvindi tee 1, Haljala',true,'Puud: ei ole puid.','57'),
    ('NESTE-058','Iru','Narva mnt 219, Iru',true,'Puud lähedal.','58'),
    ('NESTE-059','Pirita','Rummu tee 2, Tallinn',true,'Puud lähedal.','59')
)
insert into public.customer_sites(
  customer_id, external_code, name, address, requires_lift,
  service_notes, active, source, source_ref
)
select
  c.id, d.external_code, d.name, d.address, d.requires_lift,
  d.service_notes, true, 'neste_import', d.source_ref
from neste_customer c
cross join neste_sites d
on conflict (customer_id, external_code) where external_code is not null
do update set
  name = excluded.name,
  address = excluded.address,
  requires_lift = excluded.requires_lift,
  service_notes = excluded.service_notes,
  active = true,
  source = 'neste_import',
  source_ref = excluded.source_ref;
