-- Approved schema: docs/DATABASE.md (Booking). Copied as approved; do not edit after it is applied.

-- Booking
create sequence booking_code_seq;

create table bookings (
  id                           uuid primary key default gen_random_uuid(),
  code                         text not null unique,
  type                         booking_type not null,
  status                       booking_status not null default 'draft',
  payment_state                booking_payment_state not null default 'unpaid',
  tour_id                      uuid not null references tours (id),
  departure_id                 uuid references departures (id),
  start_date                   date not null,
  customer_id                  uuid references profiles (id),
  assigned_to                  uuid references profiles (id),
  inquiry_id                   uuid unique references inquiries (id),
  adults                       int not null check (adults >= 1),
  children                     int not null default 0,
  infants                      int not null default 0,
  single_rooms                 int not null default 0,
  contact_name                 text not null,
  contact_email                text not null,
  contact_phone                text not null,
  contact_country              text,
  special_requests             text,
  locale                       locale not null,
  currency                     text not null default 'VND',
  subtotal                     bigint not null,
  discount_total               bigint not null default 0,
  total                        bigint not null,
  deposit_amount               bigint not null,
  amount_paid                  bigint not null default 0,
  payment_plan                 payment_plan not null,
  balance_due_date             date,
  hold_expires_at              timestamptz,
  quote_expires_at             timestamptz,
  tour_snapshot                jsonb not null,
  cancellation_policy_snapshot jsonb,
  terms_version                text,
  invoice_requested            boolean not null default false,
  invoice_info                 jsonb,  -- {company_name, tax_code, address, email}
  idempotency_key              text unique,
  needs_attention              boolean not null default false,
  attention_reason             text,
  utm                          jsonb,
  cancelled_at                 timestamptz,
  cancel_reason                text,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  check (infants * 2 <= adults)
);
create index on bookings (status, hold_expires_at);
create index on bookings (departure_id);
create index on bookings (customer_id);
create index on bookings (contact_email);
create index on bookings (needs_attention) where needs_attention;

create table booking_items (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  type       booking_item_type not null,
  label      text not null,
  unit_price bigint not null,
  quantity   int not null,
  amount     bigint not null  -- negative for discounts
);

create table travellers (  -- no passport numbers stored
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references bookings (id) on delete cascade,
  full_name     text not null,
  date_of_birth date,
  gender        text,
  nationality   text,
  dietary_notes text,
  is_lead       boolean not null default false
);

create table booking_events (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references bookings (id) on delete cascade,
  type        text not null,  -- status_changed, payment_received, email_sent, cancel_requested, note...
  from_status booking_status,
  to_status   booking_status,
  message     text,
  actor_id    uuid references profiles (id),  -- null = system
  created_at  timestamptz not null default now()
);
create index on booking_events (booking_id, created_at);

create trigger set_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();
