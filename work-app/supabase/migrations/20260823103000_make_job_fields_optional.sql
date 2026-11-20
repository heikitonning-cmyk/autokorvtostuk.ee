-- Allow a manager to save a draft/minimal job before all planning details are known.
alter table public.jobs
  alter column customer_id drop not null,
  alter column start_planned drop not null,
  alter column address drop not null,
  alter column work_type_id drop not null;
