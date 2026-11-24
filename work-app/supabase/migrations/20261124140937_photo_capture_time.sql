-- Preserve EXIF DateTimeOriginal as the camera wall clock, without guessing timezone.
-- Existing photos remain unknown; upload timestamps are not capture timestamps.
alter table public.job_photos add column captured_at timestamp(0) without time zone;
comment on column public.job_photos.captured_at is 'EXIF DateTimeOriginal, camera local time, timezone unknown. NULL when unavailable.';
