insert into public.vehicles (name, registration_number, active)
values ('Nissan Cabstar 16 m', null, true)
on conflict do nothing;

insert into public.work_types (name, active, seasonal) values
  ('Muu töö', true, false),
  ('Katuse hooldus', true, false),
  ('Renni puhastus', true, true),
  ('Jääpurikate eemaldus', true, true),
  ('Lume koristus katuselt', true, true),
  ('Survepesu', true, true)
on conflict (name) do nothing;

insert into public.settings (key, value) values
  ('pricing', '{"hourlyRate":45,"minimumOrder":90,"driveHourlyRate":45,"kmRate":1,"helperHourlyRate":35}'::jsonb),
  ('company', '{"name":"Euro Kapital OÜ"}'::jsonb)
on conflict (key) do nothing;
