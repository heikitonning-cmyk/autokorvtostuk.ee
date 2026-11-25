create function private.delete_job_with_sheet(p_job_id uuid,p_delete_sheet boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(private.is_manager(),false) then raise exception 'Ainult juhataja saab tööd kustutada.' using errcode='42501'; end if;
 perform 1 from public.jobs where id=p_job_id for update;
 if not found then return; end if;
 if exists(select 1 from public.job_invoices where job_id=p_job_id) then raise exception 'delete-invoice' using errcode='23514'; end if;
 if exists(select 1 from public.job_delivery_sheets where job_id=p_job_id) and not coalesce(p_delete_sheet,false) then raise exception 'delete-sheet' using errcode='23514'; end if;
 if p_delete_sheet then delete from public.job_delivery_sheets where job_id=p_job_id; end if;
 delete from public.jobs where id=p_job_id;
 -- Annual sheet counters deliberately remain untouched.
end $$;
revoke all on function private.delete_job_with_sheet(uuid,boolean) from public,anon,authenticated;
grant execute on function private.delete_job_with_sheet(uuid,boolean) to authenticated;
create function public.delete_job_with_sheet(p_job_id uuid,p_delete_sheet boolean default false) returns void language sql security invoker set search_path='' as $$ select private.delete_job_with_sheet(p_job_id,p_delete_sheet); $$;
revoke all on function public.delete_job_with_sheet(uuid,boolean) from public,anon,authenticated;
grant execute on function public.delete_job_with_sheet(uuid,boolean) to authenticated;