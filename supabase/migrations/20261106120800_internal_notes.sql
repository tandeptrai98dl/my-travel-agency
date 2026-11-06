-- Approved schema: docs/DATABASE.md (Inquiries group). internal_notes references bookings,
-- so it is created after the booking migration.

create table internal_notes (
  id          uuid primary key default gen_random_uuid(),
  body        text not null,
  author_id   uuid not null references profiles (id),
  booking_id  uuid references bookings (id),
  inquiry_id  uuid references inquiries (id),
  customer_id uuid references profiles (id),
  created_at  timestamptz not null default now(),
  check (num_nonnulls(booking_id, inquiry_id, customer_id) = 1)
);
