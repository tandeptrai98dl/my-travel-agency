-- Approved schema: docs/DATABASE.md (Payments). Copied as approved; do not edit after it is applied.

-- Payments
create table payments (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references bookings (id),
  provider        payment_provider not null,
  kind            payment_kind not null,
  status          transaction_status not null default 'pending',
  amount          bigint not null check (amount > 0),
  currency        text not null default 'VND',
  reference       text not null unique,  -- reference sent to the gateway / bank transfer memo
  provider_txn_id text,
  expires_at      timestamptz,  -- expiry of this payment attempt
  raw_response    jsonb,
  paid_at         timestamptz,
  recorded_by     uuid references profiles (id),  -- manual recording
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (provider, provider_txn_id)
);
create index on payments (booking_id);
create index on payments (status, created_at);

create table payment_links (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id),
  token_hash text not null unique,
  amount     bigint not null,
  kind       payment_kind not null,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create table webhook_events (
  id           uuid primary key default gen_random_uuid(),
  provider     payment_provider not null,
  event_key    text not null,  -- gateway transaction id
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text,
  unique (provider, event_key)
);

create trigger set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();
