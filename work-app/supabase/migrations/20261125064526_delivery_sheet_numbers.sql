lock table public.job_delivery_sheets in access exclusive mode;
alter table public.job_delivery_sheets add column sheet_year integer, add column sheet_sequence bigint, add column sheet_number text;
-- Preserve signed contents; add only a permanent reference to existing documents.
with numbered as (
 select id,extract(year from signed_at at time zone 'Europe/Tallinn')::integer as y,
 row_number() over(partition by extract(year from signed_at at time zone 'Europe/Tallinn') order by signed_at,id) as n
 from public.job_delivery_sheets
)
update public.job_delivery_sheets s set sheet_year=x.y,sheet_sequence=x.n,
sheet_number=right(x.y::text,2)||lpad(x.n::text,greatest(3,length(x.n::text)),'0')
from numbered x where s.id=x.id;

create table private.delivery_sheet_counters (
 sheet_year integer primary key,
 last_number bigint not null check(last_number>0)
);
alter table private.delivery_sheet_counters enable row level security;
revoke all on private.delivery_sheet_counters from public,anon,authenticated;
insert into private.delivery_sheet_counters select sheet_year,max(sheet_sequence) from public.job_delivery_sheets group by sheet_year;

create function private.number_delivery_sheet() returns trigger language plpgsql security definer set search_path='' as $$
declare y integer; n bigint;
begin
 if auth.uid() is null or coalesce(private.current_app_role(),'') not in ('manager','operator') or
 new.created_by is distinct from auth.uid() or not exists(select 1 from public.jobs where id=new.job_id and status<>'tuhistatud') then
   raise exception 'Saatelehe nummerdamine pole lubatud.' using errcode='42501';
 end if;
 y:=extract(year from new.signed_at at time zone 'Europe/Tallinn')::integer;
 insert into private.delivery_sheet_counters(sheet_year,last_number) values(y,1)
 on conflict(sheet_year) do update set last_number=private.delivery_sheet_counters.last_number+1
 returning last_number into n;
 new.sheet_year:=y;new.sheet_sequence:=n;
 new.sheet_number:=right(y::text,2)||lpad(n::text,greatest(3,length(n::text)),'0');
 return new;
end $$;
revoke all on function private.number_delivery_sheet() from public,anon,authenticated;
create trigger number_delivery_sheet before insert on public.job_delivery_sheets for each row execute function private.number_delivery_sheet();
alter table public.job_delivery_sheets alter column sheet_year set not null,alter column sheet_sequence set not null,alter column sheet_number set not null;
alter table public.job_delivery_sheets add constraint delivery_sheet_number_unique unique(sheet_number),add constraint delivery_sheet_year_sequence_unique unique(sheet_year,sheet_sequence);
comment on column public.job_delivery_sheets.sheet_number is 'YY + annual sequence, minimum three sequence digits. Assigned atomically at signing in Europe/Tallinn. Never recalculated from job date.';
