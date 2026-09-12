-- Hard delete must remove the whole job, including its audit history.
-- The existing AFTER DELETE audit trigger tried to insert a job_events row
-- after the parent jobs row was gone, causing a foreign-key violation.

drop trigger if exists jobs_audit_trigger on public.jobs;

create trigger jobs_audit_trigger
after insert or update on public.jobs
for each row execute function private.audit_job_change();
