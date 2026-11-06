-- Approved schema: docs/DATABASE.md (System & compliance). Copied as approved; do not edit after it is applied.

-- System & compliance
create table settings (
  key        text primary key,  -- company, contact, bank_account, booking_rules, homepage, social
  value      jsonb not null,
  is_public  boolean not null default false,
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

create table consent_records (
  id               uuid primary key default gen_random_uuid(),
  subject_email    text not null,
  profile_id       uuid references profiles (id),
  purpose          consent_purpose not null,
  granted          boolean not null,
  document_version text not null,
  booking_id       uuid references bookings (id),
  inquiry_id       uuid references inquiries (id),
  ip               inet,
  user_agent       text,
  created_at       timestamptz not null default now()
);

create table email_logs (
  id                  uuid primary key default gen_random_uuid(),
  to_email            text not null,
  template            text not null,
  subject             text not null,
  booking_id          uuid references bookings (id),
  inquiry_id          uuid references inquiries (id),
  provider_message_id text,
  status              text not null,  -- queued | sent | failed
  error               text,
  created_at          timestamptz not null default now()
);

create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references profiles (id),
  action      text not null,  -- tour.update, booking.status_change, payment.manual_record...
  entity_type text not null,
  entity_id   uuid not null,
  changes     jsonb,  -- {before, after}
  ip          inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index on audit_logs (entity_type, entity_id);
create index on audit_logs (actor_id, created_at);

create trigger set_updated_at before update on public.settings
  for each row execute function public.set_updated_at();
