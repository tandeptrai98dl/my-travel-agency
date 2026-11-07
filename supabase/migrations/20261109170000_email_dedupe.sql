-- Phase 4 PR 4E (docs/specs/phase-4-booking-payments.md decision 14): transactional emails are
-- sent after the database commit, at most once per event. The sender claims an email by inserting
-- its `email_logs` row with a dedupe key before calling Resend (a repeat insert fails on the
-- unique key and sends nothing), then records the outcome on that row. Without Resend the row is
-- written as `skipped`. `email_logs` stays service-role only (no API-role policy or grant).

alter table public.email_logs add column dedupe_key text;
alter table public.email_logs add constraint email_logs_dedupe_key_key unique (dedupe_key);
alter table public.email_logs
  add constraint email_logs_status_check check (status in ('queued', 'sent', 'failed', 'skipped'));

comment on column public.email_logs.dedupe_key is
  'Exactly-once key, e.g. booking_confirmed:<booking_events.id>; null for emails that may repeat.';
comment on column public.email_logs.error is
  'Provider HTTP status or error class only, never the provider''s message (it can echo the address).';

create index email_logs_booking_id_idx on public.email_logs (booking_id);
