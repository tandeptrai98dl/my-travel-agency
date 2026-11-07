# Database

Supabase Postgres. **Row Level Security is enabled on every table** (ADR-004).

> Status: **approved design** (ADR-005, ADR-009, ADR-010, ADR-011, ADR-012). **Migrated** from Phase 0 (`supabase/migrations/`, starting with `20261106120000_*`). Update this file whenever a migration changes the schema.

## Conventions

- Tables and columns in `snake_case`; primary keys `uuid default gen_random_uuid()`; timestamps `timestamptz` (UTC), displayed in `Asia/Ho_Chi_Minh`; departure dates use `date`.
- Money is `bigint` in dong (ADR-011). PostgREST returns JSON numbers; amounts stay far below JavaScript's safe-integer limit, so TypeScript uses `number` with integer-only helpers in `src/lib/money.ts`.
- Every foreign key is a real `references` constraint.
- Content has per-language translation tables with their own `slug`, SEO fields and `is_published` flag (ADR-006).
- Bookings store price lines (`booking_items`), a tour snapshot, a cancellation-policy snapshot and the accepted terms version.
- Booking codes come from `booking_code_seq` via `next_booking_code()`, e.g. `PTA-2611-0042`.
- Refunds are `payments` rows with `kind = 'refund'` and a positive amount; `amount_paid` = received − refunded.
- No passport numbers are stored (ADR-016).
- Customer profiles are soft-deleted (`deleted_at`) and anonymised on request; content uses `archived`.
- `updated_at` is maintained by a shared `set_updated_at()` trigger.

## Table groups (39 tables)

| Group | Tables |
| --- | --- |
| Identity | profiles (1–1 with `auth.users`) |
| Catalog | tours, tour_translations, tour_media, tour_destinations, tour_travel_styles, price_tiers, departures, cancellation_policies |
| Taxonomy | destinations, destination_translations, travel_styles, travel_style_translations |
| Booking | bookings, booking_items, travellers, booking_events, booking_access_tokens |
| Payments | payments, payment_links, webhook_events |
| Inquiries | inquiries, internal_notes |
| Content | posts, post_translations, post_categories, post_category_translations, pages, page_translations, reviews, media, redirects, subscribers, newsletter_unsubscribe_tokens |
| System & compliance | settings, consent_records, cookie_consents, email_logs, audit_logs |

Main relationships: `tours 1──* departures 1──* bookings`; `tours *──* destinations`; `inquiries 1──0..1 bookings`; `bookings 1──* payments`; `bookings 1──* booking_items / travellers / booking_events`; `auth.users 1──1 profiles 1──* bookings`.

## Schema (initial migrations)

Split into one migration per group (`<timestamp>_enums.sql`, `<timestamp>_identity.sql`, …). Add the `set_updated_at` trigger to tables with `updated_at`, then RLS and functions in follow-up migrations.

```sql
create extension if not exists pgcrypto;
create extension if not exists unaccent;
create extension if not exists pg_trgm;
create extension if not exists pg_cron;

-- Enums
create type locale as enum ('vi', 'en');
create type user_role as enum ('customer', 'sales', 'sales_manager', 'operator', 'accountant', 'editor', 'admin');
create type publish_status as enum ('draft', 'published', 'archived');
create type tour_type as enum ('group', 'private');
create type tour_scope as enum ('domestic', 'international');
create type destination_type as enum ('country', 'region', 'city');
create type departure_status as enum ('open', 'guaranteed', 'closed', 'cancelled');
create type booking_type as enum ('instant', 'quoted');
create type booking_status as enum ('draft', 'quoted', 'pending_payment', 'confirmed', 'completed', 'cancelled', 'expired');
create type booking_payment_state as enum ('unpaid', 'deposit_paid', 'paid', 'partially_refunded', 'refunded');
create type payment_plan as enum ('deposit', 'full');
create type booking_item_type as enum ('adult', 'child', 'infant', 'single_supplement', 'addon', 'discount', 'adjustment');
create type payment_provider as enum ('vnpay', 'bank_transfer', 'momo', 'onepay', 'paypal', 'cash', 'manual');
create type payment_kind as enum ('deposit', 'balance', 'full', 'refund');
create type transaction_status as enum ('pending', 'succeeded', 'failed', 'expired', 'cancelled');
create type inquiry_status as enum ('new', 'contacted', 'quoted', 'won', 'lost', 'spam');
create type review_status as enum ('pending', 'approved', 'rejected');
create type consent_purpose as enum ('terms', 'privacy', 'marketing', 'analytics');

-- Identity
create table profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text not null,
  full_name         text,
  phone             text,
  country           text,
  avatar_url        text,
  role              user_role not null default 'customer',
  locale            locale not null default 'vi',
  marketing_consent boolean not null default false,
  is_active         boolean not null default true,
  deleted_at        timestamptz,
  deletion_requested_at timestamptz,  -- Phase 5: customer asked for deletion (service role only)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- Triggers: create a profile for each new auth.users row; block role changes by non-admins.

-- Media
create table media (
  id            uuid primary key default gen_random_uuid(),
  bucket        text not null default 'media',
  path          text not null,
  original_name text check (char_length(original_name) <= 255),  -- as uploaded, for search
  mime_type     text not null,
  width         int,
  height        int,
  size_bytes    int not null,
  blur_data_url text,
  alt           jsonb not null default '{}',  -- {"vi": "...", "en": "..."}
  credit        text,
  created_by    uuid references profiles (id),
  created_at    timestamptz not null default now(),
  unique (bucket, path)
);

-- Taxonomy
create table destinations (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,  -- 'vietnam', 'ha-long-bay': used in filter URLs
  type          destination_type not null,
  parent_id     uuid references destinations (id),
  status        publish_status not null default 'draft',
  hero_media_id uuid references media (id),
  latitude      numeric(9, 6),
  longitude     numeric(9, 6),
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table destination_translations (
  id                 uuid primary key default gen_random_uuid(),
  destination_id     uuid not null references destinations (id) on delete cascade,
  locale             locale not null,
  slug               text not null,
  name               text not null,
  summary            text,
  content            jsonb,  -- Tiptap JSON
  best_time_to_visit text,
  seo_title          text,
  seo_description    text,
  is_published       boolean not null default false,
  unique (destination_id, locale),
  unique (locale, slug)
);

create table travel_styles (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,
  status        publish_status not null default 'draft',
  hero_media_id uuid references media (id),
  sort_order    int not null default 0
);

create table travel_style_translations (
  id              uuid primary key default gen_random_uuid(),
  travel_style_id uuid not null references travel_styles (id) on delete cascade,
  locale          locale not null,
  slug            text not null,
  name            text not null,
  description     text,
  seo_title       text,
  seo_description text,
  is_published    boolean not null default false,
  unique (travel_style_id, locale),
  unique (locale, slug)
);

-- Catalog
create table cancellation_policies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  version    int not null default 1,
  rules      jsonb not null,  -- [{"min_days_before": 30, "refund_percent": 80}, ...]
  summary    jsonb not null,  -- {"vi": "...", "en": "..."} shown at checkout
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table tours (
  id                     uuid primary key default gen_random_uuid(),
  code                   text not null unique,
  type                   tour_type not null,
  scope                  tour_scope not null,  -- domestic / international (brief §2)
  status                 publish_status not null default 'draft',
  duration_days          int not null check (duration_days > 0),
  duration_nights        int not null check (duration_nights >= 0),
  min_pax                int not null default 1,
  max_pax                int,
  min_pax_to_operate     int,  -- group tours
  from_price             bigint not null check (from_price >= 0),  -- private tours / tours without departures
  currency               text not null default 'VND',
  deposit_percent        int not null default 30 check (deposit_percent between 0 and 100),
  balance_due_days       int not null default 30,
  child_age_max          int not null default 11,
  infant_age_max         int not null default 1,
  is_featured            boolean not null default false,
  hero_media_id          uuid references media (id),
  cancellation_policy_id uuid references cancellation_policies (id),
  published_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index on tours (status, is_featured);

create table tour_translations (
  id              uuid primary key default gen_random_uuid(),
  tour_id         uuid not null references tours (id) on delete cascade,
  locale          locale not null,
  slug            text not null,
  title           text not null,
  subtitle        text,
  summary         text not null,
  highlights      jsonb not null default '[]',
  itinerary       jsonb not null default '[]',  -- [{day, title, description, meals[], accommodation, media_ids[]}]
  inclusions      jsonb not null default '[]',
  exclusions      jsonb not null default '[]',
  practical_info  jsonb,
  faqs            jsonb,
  seo_title       text,
  seo_description text,
  og_media_id     uuid references media (id),
  is_published    boolean not null default false,
  unique (tour_id, locale),
  unique (locale, slug)
);

create table tour_media (
  tour_id    uuid not null references tours (id) on delete cascade,
  media_id   uuid not null references media (id),
  sort_order int not null default 0,
  primary key (tour_id, media_id)
);

create table tour_destinations (
  tour_id        uuid not null references tours (id) on delete cascade,
  destination_id uuid not null references destinations (id),
  primary key (tour_id, destination_id)
);
create index on tour_destinations (destination_id);

create table tour_travel_styles (
  tour_id         uuid not null references tours (id) on delete cascade,
  travel_style_id uuid not null references travel_styles (id),
  primary key (tour_id, travel_style_id)
);

create table price_tiers (  -- indicative private-tour pricing by group size
  id              uuid primary key default gen_random_uuid(),
  tour_id         uuid not null references tours (id) on delete cascade,
  min_pax         int not null,
  max_pax         int not null,
  price_per_adult bigint not null,
  valid_from      date,
  valid_to        date
);

create table departures (
  id                uuid primary key default gen_random_uuid(),
  tour_id           uuid not null references tours (id),
  start_date        date not null,
  end_date          date not null,
  capacity          int not null check (capacity > 0),
  seats_reserved    int not null default 0,  -- adults + children held or confirmed; infants excluded
  status            departure_status not null default 'open',
  price_adult       bigint not null,
  price_child       bigint,
  price_infant      bigint,
  single_supplement bigint,
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tour_id, start_date),
  check (seats_reserved between 0 and capacity),
  check (end_date >= start_date)
);
create index on departures (tour_id, status, start_date);
create index on departures (start_date, status);

-- Inquiries
create table inquiries (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  status             inquiry_status not null default 'new',
  name               text not null,
  email              text not null,
  phone              text,
  country            text,
  company_name       text,  -- corporate clients
  preferred_contact  text,  -- email | phone | zalo | whatsapp
  destination_ids    uuid[] not null default '{}',
  destinations_other text,
  travel_style_id    uuid references travel_styles (id),
  tour_id            uuid references tours (id),  -- sent from a private-tour page
  travel_month       text,  -- '2027-03'
  flexible_dates     boolean not null default true,
  duration_days      int,
  adults             int,  -- null for general contact messages (source = 'contact')
  children           int not null default 0,
  budget_per_person  text,
  message            text,
  locale             locale not null,
  source             text,
  utm                jsonb,
  assigned_to        uuid references profiles (id),
  first_responded_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on inquiries (status, created_at);

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

create table booking_access_tokens (  -- single-use emailed checkout (and Phase 5 lookup) links, ADR-038
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  purpose    text not null check (purpose in ('email', 'lookup')),
  token_hash text not null unique,  -- SHA-256 hex of the emailed token
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

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

-- Content
create table reviews (
  id             uuid primary key default gen_random_uuid(),
  tour_id        uuid references tours (id),
  booking_id     uuid unique references bookings (id),
  author_name    text not null,
  author_country text,
  rating         int not null check (rating between 1 and 5),
  title          text,
  content        text not null,
  locale         locale not null,
  travel_date    date,
  is_verified    boolean not null default false,  -- true when linked to a completed booking
  status         review_status not null default 'pending',
  is_featured    boolean not null default false,
  created_at     timestamptz not null default now()
);

create table post_categories (
  id         uuid primary key default gen_random_uuid(),
  sort_order int not null default 0
);

create table post_category_translations (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references post_categories (id) on delete cascade,
  locale      locale not null,
  slug        text not null,
  name        text not null,
  unique (category_id, locale),
  unique (locale, slug)
);

create table posts (
  id             uuid primary key default gen_random_uuid(),
  status         publish_status not null default 'draft',
  category_id    uuid references post_categories (id),
  author_id      uuid references profiles (id),
  cover_media_id uuid references media (id),
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table post_translations (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references posts (id) on delete cascade,
  locale          locale not null,
  slug            text not null,
  title           text not null,
  excerpt         text,
  content         jsonb not null,
  seo_title       text,
  seo_description text,
  is_published    boolean not null default false,
  unique (post_id, locale),
  unique (locale, slug)
);

create table pages (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,  -- about, terms, privacy, cancellation, payment, faq
  status     publish_status not null default 'draft',
  updated_at timestamptz not null default now()
);

create table page_translations (
  id              uuid primary key default gen_random_uuid(),
  page_id         uuid not null references pages (id) on delete cascade,
  locale          locale not null,
  slug            text not null,
  title           text not null,
  content         jsonb not null,
  seo_title       text,
  seo_description text,
  is_published    boolean not null default false,
  unique (page_id, locale),
  unique (locale, slug)
);

create table redirects (
  id          uuid primary key default gen_random_uuid(),
  from_path   text not null unique,
  to_path     text not null,
  status_code int not null default 301,
  hits        int not null default 0,
  created_at  timestamptz not null default now()
);

create table subscribers (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null unique,
  locale             locale not null,
  source             text,
  confirm_token_hash text,
  confirmed_at       timestamptz,  -- double opt-in
  unsubscribed_at    timestamptz,
  created_at         timestamptz not null default now()
);

create table newsletter_unsubscribe_tokens (  -- Phase 6 PR 6P: single-use unsubscribe links from the export
  id            uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references subscribers (id) on delete cascade,
  token_hash    text not null unique,  -- SHA-256 hex; the plaintext exists only in the exported CSV
  created_at    timestamptz not null default now(),
  used_at       timestamptz
);

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

create table cookie_consents (  -- Phase 6 PR 6P, ADR-039: proof of cookie choices, pseudonymous
  record_id      bigint generated always as identity primary key,
  id             uuid not null,  -- random UUID kept in the visitor's `consent` cookie; never sent to GA, Sentry or logs
  action         text not null check (action in ('accept_all', 'essential_only', 'custom', 'withdraw')),
  choices        jsonb not null,  -- exactly {"analytics": bool, "marketing": bool}; agrees with the action
  banner_version text not null check (banner_version ~ '^banner-(vi|en)-[0-9a-f]{16}$'),  -- hash of the banner and settings texts
  locale         locale not null,
  created_at     timestamptz not null default now()
  -- no IP, user agent or account link; a changed choice is a new row with the same id
);

create table email_logs (
  id                  uuid primary key default gen_random_uuid(),
  to_email            text not null,
  template            text not null,
  subject             text not null,
  booking_id          uuid references bookings (id),
  inquiry_id          uuid references inquiries (id),
  provider_message_id text,
  status              text not null,  -- queued | sent | failed | skipped (no Resend configured)
  error               text,           -- provider HTTP status or error class only, never its message
  dedupe_key          text unique,    -- exactly-once key (e.g. booking_confirmed:<booking_events.id>), 4E
  failed_at           timestamptz,    -- when the send failed (trigger on the change to failed), Phase 6 PR 6B
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
```

## RLS policy summary

Helpers (`security definer`, `stable`, `set search_path = ''`): `current_user_role()`, `has_role(user_role[])`, `is_staff()`, `is_mfa_verified()` (`auth.jwt() ->> 'aal' = 'aal2'`, required for admin and accountant). `is_admin()` may remain as a wrapper for `has_role('{admin}')`.

Policies call `can_act_as(user_role[])`: true when the user holds one of the roles and, for admin and accountant, the session is `aal2`. It keeps the MFA rule in one place. `current_user_role()` returns null for deactivated or soft-deleted profiles, so they lose all staff access.

Triggers: `handle_new_user()` creates a `customer` profile for each new `auth.users` row (name and locale from user metadata); `handle_user_email_change()` keeps `profiles.email` in sync; `guard_profile_update()` lets only an MFA-verified admin change `role`, `is_active`, `deleted_at` or `email`, and no API role change `marketing_consent` or `deletion_requested_at` (Phase 5; the service role, `postgres` and definer functions are trusted, for seeding, invitations, consent and deletion). `audit_row_change(id column, kept columns, ignored columns)` (Phase 2) writes `audit_logs` after every insert, update and delete on the catalog, taxonomy, content, media, redirect and settings tables, and after profile updates and deletes: actor `auth.uid()` (null for the service role), action `<table>.<op>`, only the changed columns before and after (`updated_at` ignored, no-op updates skipped). Join tables log against their tour; `settings` rows use `md5(key)::uuid` and keep the key in `changes`. Profiles keep values only for `role`, `is_active` and `deleted_at` and list other changed columns by name (`changes.changed`), so no personal data is copied; `departures.seats_reserved` alone is not logged. `ip` and `user_agent` are left null by the trigger (the database only sees the server). `audit_logs.actor_id` is `on delete set null`.

Content rules (Phase 2, `*_taxonomy_rules.sql`; the admin services check the same first): every translation slug matches `is_valid_slug()` (lower-case ASCII words joined by single hyphens, at most 80 characters) on destinations, travel styles, tours, posts, post categories and pages; `lock_published_key()` keeps the `key` of a published destination or travel style; `check_destination_parent()` keeps the tree to country → region → city (a country has no parent, a region sits under a country, a city under a region) and `check_destination_children()` stops a parent changing type while it has children; `check_translation_publishable()` refuses a published destination or travel-style translation without its name and summary/description; `is_valid_cancellation_rules()` requires 1–10 rules ordered from the earliest cancellation with whole-number days (0–365) and refunds (0–100 %) that never grow, the last at 0 days (missing keys, non-objects and nulls are refused); a partial unique index allows one default cancellation policy, `set_default_cancellation_policy()` moves it in one transaction, and the deferred constraint trigger `keep_default_cancellation_policy()` refuses switching off the last default or deleting it.

API roles: anon has no INSERT/UPDATE/DELETE privilege on any table, and TRUNCATE (which ignores RLS) is revoked from anon and authenticated; default privileges keep this true for tables added later.

Column grants (RLS picks the rows, grants pick the columns): on `bookings`, API roles may only update contact fields, `special_requests`, `assigned_to`, `invoice_requested` and `invoice_info`, and cannot insert; `booking_items` has no write policy; on `departures`, `seats_reserved` is never writable through the API; on `profiles` (Phase 5, `*_customer_reads.sql`), `authenticated` may update only `full_name`, `phone`, `country`, `avatar_url`, `locale` and the admin-guarded `role`, `is_active`, `deleted_at` and `email`. Status, money, seats, ownership and snapshots change only in service-role Postgres functions (ADR-012). Staff-created (manual) bookings and price adjustments therefore arrive with those functions in Phase 4.

Tour rules (Phase 2, `*_tour_rules.sql`, ADR-024): `guard_tour_prices()` and `guard_departure_prices()` let only an MFA-verified admin (or the service role and `postgres`) set `tours.from_price`, `deposit_percent`, `balance_due_days`, `cancellation_policy_id` and the four departure price columns; non-admin inserts get defaults (tours) or the prices of the tour's latest departure (departures; a tour's first departure needs an admin). `validate_tour_publishable` (`check_tour_publishable()`) requires a published translation, a hero with VI/EN alt text (`media_alt_complete()`) and a price (a non-cancelled departure for group tours, `from_price > 0` for private tours); `check_tour_translation()` requires a title, summary and SEO description on published translations and keeps a published tour's last one; `check_hero_alt()` and `keep_hero_alt()` keep heroes of published destinations, travel styles and tours described; tour codes match `^[A-Z0-9]+(-[A-Z0-9]+)*$`.

Departure rules (Phase 2, `*_departure_rules.sql`, ADR-026): `check_departure_change()` keeps `capacity` at or above `seats_reserved`; through the API only an MFA-verified admin cancels or reopens a departure, and not while it has `pending_payment` or `confirmed` bookings (`departure_has_open_bookings()`); for every role, the last departure that is not cancelled of a published group tour cannot be cancelled, deleted or moved to another tour; that check and `check_tour_publishable()` first lock the tour row (`lock_tour_row()`), so concurrent removals and a concurrent publication are serialised.

Content rules (Phase 2, `*_content_rules.sql`, ADR-030): `check_content_translation()` (post and page translations) requires a title, content (`rich_text_is_empty()`) and an SEO description on published translations, VI/EN alt text on their images (`rich_text_alt_complete()`, `rich_text_media_ids()`), keeps a published item's last published translation and stops translations moving to another item; `check_content_publishable()` requires a published translation (posts and pages) and a cover with both alt texts (posts); `keep_hero_alt()` also covers post covers and images inside published rich text (articles, pages and destination descriptions); `guard_media_delete()` refuses deleting an image referenced in rich text or itinerary JSON (`media_used_in_content()`, case-insensitive), with the foreign-key error code; `guard_post_delete()` refuses deleting a published article.

Review rules (Phase 2, `*_review_rules.sql`): API roles may update only `reviews.status` and `is_featured` (column grants), a featured review must be approved (`reviews_featured_approved`), and `guard_review_insert()` makes reviews written in by staff unverified and unlinked to a booking (the service role is trusted for P1 post-trip reviews).

Redirect rules (Phase 2, `*_redirect_rules.sql`, ADR-031): `from_path` and `to_path` are site paths (sources without `?` or `#`, not `/`), a redirect never points to itself, `status_code` is 301, 302, 307 or 308, and `check_redirect_chain()` refuses a target that is itself redirected and a source other redirects point to; since `*_review_followups.sql` it takes a transaction advisory lock first, so two concurrent saves cannot build a chain. Writes go through two `security invoker` functions (RLS still applies; execute for authenticated and service_role only), each in one transaction: `create_redirect(source, target, status)` refuses a taken source (`23505`) or a redirected target, flattens redirects that pointed to the source, then inserts; `record_slug_redirect(source, target)` (slug changes) drops a redirect away from the new path, retargets redirects to the old path and upserts old → new. Redis keeps a copy (hash `redirects`; requests time out after 3 s, a full resync is one MULTI/EXEC).

Settings and staff rules (Phase 2, `*_settings_rules.sql`, `*_staff_rules.sql`, ADR-032): `settings_private_keys` refuses `bank_account` and `booking_rules` as public rows; `keep_active_admin()` (before update or delete on `profiles`, for every role) refuses an admin removing their own admin role or access and refuses removing the last active admin (advisory lock, so two admins demoting each other cannot both pass). Staff invitations are written by the identity module with the service role and recorded as `staff.invite` in `audit_logs`. The homepage hero (`settings.homepage.hero.media_id`, `is_homepage_hero()`, `*_homepage_hero_rules.sql`) keeps both alt texts through `keep_hero_alt()` and counts as in use for `media_used_in_content()`, so it cannot be deleted while the homepage shows it.

Images inside JSON (`*_review_followups.sql`): `check_translation_publishable()` also requires VI/EN alt text on images inside a published destination translation's `content`; `check_tour_itinerary_alt()` requires them on the day photos of a published tour translation's itinerary (`itinerary_media_ids()`, any letter case); `keep_hero_alt()` keeps the alt texts of both.

Inquiry inbox (Phase 5, `*_inquiry_inbox.sql`, ADR-037): sales read inquiries assigned to them or unassigned; `sales_manager`, operator and admin read every inquiry. API roles have no `UPDATE` on `inquiries` (the two update policies were dropped) and staff inserts cannot set `status`, `assigned_to` or `first_responded_at` (column grants), so those change only through role-checked definer functions that write `audit_logs` (`inquiries.assign`, `inquiries.status`, `inquiries.note`, `inquiries.quote`; ids, statuses and flags only, never the note text). `can_work_inquiry(owner)` (sales managers and admins any; sales their own and unassigned ones) and `can_read_inquiry(owner)` (also operators) decide inside them; a seller asking for an inquiry someone else owns gets `not_found` (`P0002`), so the two cannot be told apart. The first response (`first_responded_at`) is set once, by the first status change away from `new` (except to `spam`), the first note with `contacted = true` or a quote.

Guest lookup and deletion (Phase 5, `*_booking_lookup_deletion.sql`, spec decisions 7 and 8): `issue_booking_lookup()` stores a lookup token hash only when the code and the address match and the booking has fewer than 3 open lookup tokens; the link opens the checkout summary through the emailed-link flow of ADR-038. A deletion runs three steps in order (ban the Auth user and revoke its sessions, `anonymise_customer()`, GoTrue's soft delete) and is safe to repeat; `handle_user_email_change()` leaves deleted profiles alone, so the soft delete's obfuscated address never replaces the profile's placeholder. Reviews are audited with values only for the moderation columns (`id`, `tour_id`, `booking_id`, `rating`, `locale`, `travel_date`, `is_verified`, `status`, `is_featured`, `created_at`); the reviewer's name, country, title and text are named, never copied, and `anonymise_customer()` removes the name from older review audit rows.

Customer reads (Phase 5, `*_customer_reads.sql`, closes the last Phase 0 limit): customers have no policy on `bookings`, `booking_items`, `payments` or `travellers` (the six direct customer policies were dropped) and read or write them only through the customer functions below, which return a fixed set of columns and nothing for a deactivated or deleted profile.

| Table | anon | Signed-in customer | Staff |
| --- | --- | --- | --- |
| tours, departures, destinations, travel_styles, posts, pages, media + translation tables | Read `published` rows and translations with `is_published` | Same as anon | Read all; write per the matrix in `ARCHITECTURE.md` |
| reviews | Read `approved` | Same as anon | editor, admin write |
| profiles | — | Read/update own profile except `role` | Read; only admin changes `role` |
| bookings, booking_items, travellers, payments | — | No direct access; own bookings through `customer_bookings()`, `customer_booking(code)` and `save_customer_travellers()` | Per the matrix; financial tables need `aal2` |
| inquiries, internal_notes | — | — | Read: sales their own and unassigned inquiries, sales_manager, operator and admin all; status, owner, notes and first response only through the inquiry functions (operator read-only) |
| payment_links, webhook_events | — | — | accountant, admin read; writes only via service role |
| settings | Read keys with `is_public` | Same as anon | admin writes |
| consent_records, email_logs, audit_logs | — | — | admin reads; `email_logs` rows of a booking also for staff who read bookings (resend); a customer's consent history (no IP or user agent) also for staff who read customers (sales roles, operator, accountant) through `customer_consents()`; writes only via service role or triggers |
| cookie_consents | — | — | No policy and no privilege for any API role; written by `record_cookie_consent()` (service role), purged after 5 years |
| newsletter_unsubscribe_tokens | — | — | No policy and no privilege for any API role; written and redeemed only by the two service-role newsletter functions |
| booking_access_tokens | — | — | admin reads; writes only via service-role functions |
| redirects, subscribers | — | — | editor, admin |

Guests create draft bookings, inquiries and newsletter sign-ups only through Server Actions using the service role after validation, Turnstile and rate limiting. Every policy has pgTAP tests.

## Storage

- `media`: public read; editor and admin may list and delete, but only the service role writes: it holds the checked, re-encoded copies (ADR-023). JPEG, PNG, WebP and AVIF only (no SVG), up to 20 MB. Replaces the draft `tour-images` bucket.
- `media-uploads`: private staging for originals uploaded through signed URLs (`pending/<user id>/<uuid>.<ext>`); no API-role policies; the service role signs, reads and deletes. Same type and size limits.
- `private`: no public access and no API-role policies; signed URLs created by the service role only (vouchers and PDF quotes, P1). PDF only, up to 10 MB.

## Postgres functions

| Function | Callable by | Purpose |
| --- | --- | --- |
| `search_tours(...)` | anon, authenticated (`security invoker`) | Filtered, sorted tour listing (`docs/specs/tour-listing.md`) |
| `search_site(locale, q, limit)` | anon, authenticated (`security invoker`) | Site search: published destinations and journal articles matching a term (diacritic- and case-insensitive, LIKE wildcards literal), a limit per kind (Phase 3 PR L) |
| `media_alt_complete(media_id)` | everyone (`security invoker`) | Both alt texts present (publish rules) |
| `default_cancellation_policy_id()` | authenticated (`security definer`) | The default policy for new tours (price guard) |
| `departure_has_open_bookings(target_id)` | authenticated (`security definer`; false unless the caller may read bookings: sales, sales_manager, operator, accountant, admin) | Whether a departure has `pending_payment` or `confirmed` bookings (departure rules) |
| `lock_tour_row(target_id)` | authenticated (`security definer`; a no-op unless staff or trusted) | Locks a tour row (`for no key update`) for the caller's transaction, so the last-departure rule and publishing a tour cannot race (`SELECT ... FOR UPDATE` would apply UPDATE policies operators do not have) |
| `rich_text_media_ids(doc)`, `rich_text_is_empty(doc)`, `rich_text_alt_complete(doc)` | everyone (`security invoker`) | Read Tiptap JSON in the content rules |
| `itinerary_media_ids(itinerary)` | everyone (`security invoker`) | Day photo ids of a tour itinerary (alt-text rules) |
| `is_homepage_hero(target_id)` | everyone (`security invoker`; reads `settings` under RLS) | Whether an image is the homepage hero (alt-text and delete rules) |
| `media_used_in_content(target_id)` | authenticated (`security definer`; false unless staff or trusted) | Whether an image id appears in rich text or itinerary JSON, in any letter case (media delete guard) |
| `is_staff_or_trusted()` | authenticated (`security definer`) | Staff, the service role or a session without `SET ROLE` (postgres); gates the definer helpers |
| `set_tour_links(target_id, media_ids, destination_ids, travel_style_ids)` | authenticated (`security invoker`; RLS lets editors and admins write the link tables) | A tour's gallery (in order), destinations and travel styles in one transaction, writing only what changed |
| `set_default_cancellation_policy(policy_id)` | authenticated (`security invoker`; RLS lets only an MFA-verified admin write) | Move the default cancellation policy in one transaction |
| `next_booking_code()` | service_role | Booking codes from the sequence (`PTA-YYMM-NNNN`, Vietnam month) |
| `create_draft_booking(payload)`, `update_draft_booking(target_id, payload)` | service_role | Draft with price lines and snapshots, idempotent per key; party rules, exactly one adult/child/infant/single-supplement line per count, prices and totals checked against the departure (`price_changed`); no seats |
| `reserve_and_create_payment(target_id, provider, kind)` | service_role | Expire first; hold seats by a conditional update (`sold_out`), booking → `pending_payment`, `pending` payment with `expires_at` = hold; method switch keeps seats with a new window; at most 5 attempts; `balance` payments for confirmed bookings |
| `record_payment_event(provider, event_key, payload, reference, amount, provider_txn_id, succeeded)` | service_role | The `confirm_payment` of the design: `webhook_events` dedupe, unmatched references, failed results, under/overpaid, money for attempts that are no longer pending as new rows of the same kind (`overpaid`, `paid_after_switch`, `paid_after_failure`, `paid_after_expiry`, `paid_after_cancel`), a repeated gateway transaction id treated as a duplicate, late payments, confirmation at the deposit |
| `expire_booking_if_due(target_id)`, `expire_holds()` | service_role; `pg_cron` every 5 min | Expire lapsed holds and quotes (seats released, open payments expired); drafts older than 7 days. The job takes bookings `for update skip locked`, so it never waits for a booking while holding a departure lock (no deadlock with a customer's function); skipped bookings expire at their next read or the next run |
| `cancel_booking(target_id, actor, reason)` | service_role | Cancel, release seats, record event, return the policy's suggested refund |
| `complete_bookings()` | `pg_cron`, nightly | Confirmed bookings whose departure has ended → `completed` |
| `next_inquiry_code()` | service_role | Inquiry codes `INQ-YYMM-NNNN` from `inquiry_code_seq`, for every inquiry source |
| `create_contact_inquiry(name, email, phone, preferred_contact, message, locale, tour_code, privacy_version, ip, user_agent)` | service_role | Contact form: validates, saves an inquiry with `source = 'contact'` and records the privacy consent with the published policy's version (ADR-035); returns the code (Phase 3 PR K) |
| `create_tailor_made_inquiry(payload, privacy_version, ip, user_agent)` | service_role | Tailor-made wizard and private-tour inquiry form (Phase 5 PR 5W): validates, maps to existing `inquiries` columns (destinations and travel style by public key, published only; tour code, required for `tour_inquiry` and only a published private tour; campaign tags), source `tailor_made` or `tour_inquiry`, records the privacy consent with the published version (`privacy-(vi|en)-<16 hex>`, ADR-035); returns `{id, code}` |
| `request_newsletter_subscription(email, locale, source, token_hash)` | service_role | Newsletter double opt-in step 1: stores the token hash; true when a confirmation email should be sent (ADR-029) |
| `confirm_newsletter_subscription(token_hash, document_version, ip, user_agent)` | service_role | Step 2: confirms once and records the marketing consent in `consent_records` with the published privacy policy's version (ADR-035) |
| `check_seat_invariant()`, `raise_on_seat_mismatch()` | `pg_cron`, nightly | `seats_reserved` must equal adults + children of `pending_payment`, `confirmed` and `completed` bookings; mismatches go to `audit_logs` (`departures.seat_mismatch`) and a warning; a later job raises while a mismatch from the last day is on record, so its failed run alerts |
| `record_manual_payment(target_id, amount, method, note)` | authenticated (`security definer`; accountant or admin at aal2) | Cash, a transfer confirmed with the bank or money taken by phone (`cash`, `bank_transfer`, `manual`), with a required note; recorded through `record_payment_event()`, so confirmation and flags follow the gateway rules; `recorded_by`, a booking event and `payments.manual_record` in `audit_logs` (`*_booking_admin.sql`) |
| `record_refund(target_id, amount, method, note)` | authenticated (`security definer`; accountant or admin at aal2) | A `kind = 'refund'` row, never more than `amount_paid` (already net of refunds), note required; `amount_paid` and `payment_state` recomputed; `payments.refund` in `audit_logs` |
| `assign_unmatched_transfer(event_id, target_id, note)` | authenticated (`security definer`; accountant or admin at aal2) | Assigns a bank credit stored as `unmatched` to a booking, with the webhook's amount and its transaction id (so it is counted once); the event becomes `assigned`; `payments.assign_transfer` in `audit_logs` |
| `staff_cancel_booking(target_id, reason)` | authenticated (`security definer`; operator or admin) | `cancel_booking()` with the staff member as actor and a required reason; returns the suggested refund and writes `bookings.cancel` (reason, suggested refund) to `audit_logs` |
| `request_cancellation(target_id, note)`, `resolve_attention(target_id, note)`, `attention_resolvers(reason)` | authenticated (`security definer`; requests: sales roles, operator, admin) | A request flags `cancel_requested` unless a money reason is open (that one is kept, and the request comes back when it is resolved). Resolving needs the reason's roles from `attention_resolvers()`: `cancel_requested` operator or admin, every other (money) reason an accountant or admin at aal2; the note goes to `booking_events`. Manual or assigned money for a cancelled booking sets `paid_after_cancel` (`*_booking_admin_review.sql`). `require_note()` (at least 3 characters) is shared |
| `create_checkout_draft(payload, terms_version, privacy_version, marketing, ip, user_agent)` | service_role | The book-now draft and its consent in one transaction (spec Phase 4 decisions 2 and 9): `create_draft_booking()`, then `consent_records` rows for terms (when a terms page is published) and privacy (required), marketing only when ticked, and `bookings.terms_version`; a replay with the same key records nothing twice (`*_booking_consent.sql`) |
| `booking_checkout_status(target_code)` | service_role | Status, payment state, amounts and hold expiry for the checkout result page's poll, after the booking module has checked access |
| `create_quote(payload)` | authenticated (`security definer`; sales, sales_manager, admin) | A `quoted` booking for a private tour only (group tours are refused, `*_quote_private_only.sql`) at staff prices per adult and child (infants free), the snapshot title in the quote's language or else the other language's, the tour's deposit rule, `quote_expires_at`, snapshots and price lines; links and marks the inquiry `quoted` (only one the caller may work, `*_inquiry_inbox.sql`), sets its first response and gives an unassigned one to the seller who quoted it (`inquiries.quote` in `audit_logs`); `bookings.quote` in `audit_logs` (`*_quotes_payment_links.sql`) |
| `assign_inquiry(target_id, assignee)` | authenticated (`security definer`; sales take an unassigned inquiry for themselves; sales_manager and admin at aal2 assign any active sales role or admin, or nobody) | Inquiry owner; `invalid_assignee` (`22023`) for anyone else; `inquiries.assign` in `audit_logs` |
| `update_inquiry_status(target_id, new_status, note)` | authenticated (`security definer`; sales on their own and unassigned inquiries, sales_manager, admin) | Any status but `new` (`invalid_status`); the same status changes nothing; the first change away from `new` (except `spam`) is the first response; an optional note (up to 2000 characters) becomes an internal note; `inquiries.status` in `audit_logs` |
| `add_inquiry_note(target_id, body, contacted)` | authenticated (`security definer`; as above) | Internal note (3–2000 characters); `contacted = true` sets the first response once and moves `new` to `contacted`; `inquiries.note` in `audit_logs` |
| `inquiry_consents(target_id)`, `inquiry_activity(target_id)` | authenticated (`security definer`; empty unless the caller may read the inquiry) | The inquiry's consent versions and its audit rows for the admin detail page (`consent_records` and `audit_logs` stay admin-only tables) |
| `can_work_inquiry(owner)`, `can_read_inquiry(owner)` | authenticated (`security definer`) | Whether the caller may work or read an inquiry with this owner; `lock_workable_inquiry()` and `log_inquiry_change()` are internal helpers with no API grant |
| `create_payment_link(target_id, token_hash, valid_hours)` | authenticated (`security definer`; sales, sales_manager, admin) | Stores only the SHA-256 of an app-made token for the amount due now (deposit, full or balance), at most 7 days and never past the quote's expiry; booking event `payment_link_created` |
| `redeem_payment_link(token_hash)`, `payment_link_state(token_hash)` | service_role | Opens a link once before its expiry for a booking still payable (the link page's button, never a plain visit); the state check has no side effects |
| `issue_booking_access_token(target_id, purpose, token_hash, valid_minutes)`, `booking_access_token_state(target_code, token_hash)`, `redeem_booking_access_token(target_code, token_hash)` | service_role | Single-use emailed checkout links (ADR-038): store only the hash (up to 7 days), report valid/used/expired/invalid for the booking in the URL without side effects, redeem once on the customer's click (`*_email_polish.sql`) |
| `issue_booking_lookup(target_code, email, token_hash, valid_minutes)` | service_role | Guest lookup (Phase 5 PR 5B): code and address match (any case, trimmed), fewer than 3 unused, unexpired lookup tokens for the booking; stores the hash with purpose `lookup` for `settings.booking_rules.booking_lookup_link_minutes` (default 30, 10–120); returns the token id, booking id, locale and expiry, or null. Nothing it returns reaches the response |
| `request_customer_deletion(target_id)`, `customer_deletion_state(target_id)`, `confirmed_customer_email(target_id)` | service_role | Records `profiles.deletion_requested_at` (customers only) and returns why it must wait (`open_payment`, `balance_due`, `upcoming_trip`, `attention` for an open money reason), by the account's bookings and those with its confirmed address; the state of the three deletion steps (`auth.users.deleted_at` included) |
| `customer_deletion_blockers(target_id)` | service_role | The read-only half of `request_customer_deletion()` (which calls it since `*_operations.sql`, Phase 5 PR 5D): the same reasons, nothing recorded |
| `anonymise_customer(target_id)` | service_role | Every SQL change of spec decision 8 in one transaction, idempotent (a second run changes nothing and writes no audit row): profile cleared with a `deleted+<id>@invalid.local` address and `deleted_at`; bookings unlinked and kept; inquiries without a booking anonymised and their notes deleted, with the customer's own notes; the subscriber row deleted with a `marketing` withdrawal in `consent_records` (document `account-deletion`); `email_logs` addresses replaced; reviews on the customer's bookings reduced to initials (`name_initials()`) and the name removed from their audit rows; unused access tokens deleted; `customers.anonymise` with counts in `audit_logs` |
| `admin_anonymise_customer(target_id, note)` | authenticated (`security definer`; admin at aal2) | Finishes a request that had to wait: a note, a customer with a request on record and, since `*_operations.sql`, nothing blocking it any more (`blocked`, `55000`, while `customer_deletion_blockers()` returns a reason), then `anonymise_customer()`; `customers.anonymise_by_admin` with the note in `audit_logs`. The account service runs the Auth steps around it |
| `admin_deletion_requests(target_id default null)` | authenticated (`security definer`; admin at aal2) | Open deletion requests (requested, with the profile or the Auth user not yet deleted; `auth.users` is not readable by API roles): id, address, name, request time, the state of both deletions and the blockers; one customer with `target_id` (Phase 5 PR 5D) |
| `admin_dashboard()` | authenticated (`security definer`; every staff role, admin and accountant at aal2; `42501` otherwise) | The `/admin` figures in one read (spec Phase 5 decision 13), one section per role: `sales` (sales: their own; sales_manager and admin: the team) new bookings in 7 days (drafts left out), open and unassigned inquiries, quotes awaiting payment, the 30-day median first response; `operations` (operator, admin) departures in the next 14 days with seats, confirmed travellers (confirmed and completed bookings, as `departures_below_minimum()` counts them, since `*_phase6_backlog.sql`), party and traveller rows, departures below their minimum (21 days), confirmed bookings missing traveller details; `finance` (accountant, admin) money collected this Vietnam month net of refunds, pending payments expiring within 30 minutes, unmatched transfers, the money part of the attention queue (flagged money reasons and overdue balances); `content` (editor, admin) drafts, published items missing a published language, images without both alt texts; `admin` open deletion requests |
| `departures_below_minimum(within_days default 21)` | service_role | Open or closed departures from today to `within_days` ahead (Vietnam dates) whose confirmed and completed adults + children are below `tours.min_pax_to_operate` (guaranteed and cancelled ones are left out), with the days left; the departure-checks job and the dashboard |
| `export_departure_passengers(target_id)` | authenticated (`security definer`; operator, admin at aal2) | The passenger list of a departure (spec Phase 5 decision 14): travellers of confirmed and completed bookings (name, birth date, nationality, dietary notes, booking code, lead flag, party size; the contact phone on the lead only; a booking without traveller rows lists its contact as the lead). No passport numbers exist. Writes `departures.passenger_export` (actor, departure, row count) to `audit_logs` first, in the same transaction |
| `customer_consents(target_id)` | authenticated (`security definer`; empty unless the caller reads customers: sales roles, operator, accountant, admin) | A customer's consent history by account and confirmed address (purpose, granted, version, time; no IP or user agent), since `consent_records` stays admin-only |
| `customer_data_export(target_id)` | service_role | The personal-data export (decisions 8 and 16): profile, bookings by account and by the confirmed address (`confirmed_customer_email()`, never `profiles.email`) without internal columns, their travellers, consents (with IP and user agent) and inquiries. The account service checks the MFA-verified admin and writes `customers.export` to `audit_logs` before the file is handed out |
| `customer_bookings()`, `customer_booking(target_code)` | authenticated (`security definer`) | The caller's bookings (`customer_id = auth.uid()`, active profile): list columns, and for one code the price lines, travellers, payments (amount, kind, provider, status, dates only), the cancellation summary and whether travellers can be edited; never `needs_attention`, `attention_reason`, `assigned_to`, `idempotency_key`, `utm` or payment internals (`*_customer_reads.sql`) |
| `save_customer_travellers(target_code, travellers)` | authenticated (`security definer`) | Replaces the caller's travellers before the departure date (Vietnam): at most adults + children + infants rows, a name each, only `full_name`, `date_of_birth`, `nationality`, `dietary_notes`, `is_lead`, exactly one lead, birth dates real and not in the future; booking event `travellers_updated` |
| `attach_customer_bookings(target_id)` | service_role (`*_customer_reads_review.sql`) | Sets `customer_id` on unowned bookings whose contact email matches the user's **confirmed** `auth.users.email` (by id, never the JWT claim or `profiles.email`; active profiles only); booking event `attached_to_account`; returns the count. The identity service calls it with the id from `getUser()`, only while GoTrue does not auto-confirm emails (ADR-037). Never callable by a session: a direct API call would skip that guard |
| `set_marketing_consent(target_id, granted, document_version)` | service_role (`*_customer_reads_review.sql`) | The account's marketing choice and its `consent_records` row in one transaction; the version must be a published privacy-policy version (`privacy-vi-` or `privacy-en-` and 16 hex digits), passed by the account service |
| `record_signup_consent(target_id, privacy_version, marketing, ip, user_agent)` | service_role | Privacy (and marketing, when ticked) consent of a new account, once |
| `current_customer_id()`, `customer_travellers_editable(status, start_date)`, `is_real_date(value)` | service_role | Helpers of the customer functions (`is_real_date`: a real `YYYY-MM-DD` calendar date) |
| `record_cookie_consent(id, action, analytics, marketing, banner_version, locale)` | service_role | One cookie choice from the banner or the settings dialog (Phase 6 PR 6P, ADR-039): the consent Server Action calls it after Zod and a per-IP rate limit; the table's checks keep the choices to the two booleans and make them agree with the action |
| `purge_cookie_consents()` | `pg_cron` daily (`cookie-consents-purge`, 03:10 Vietnam) | Deletes `cookie_consents` rows older than 5 years (retention confirmed by counsel, owner item 4a); returns the count |
| `issue_newsletter_unsubscribe_tokens(subscriber_ids, token_hashes)` | service_role | The subscriber export (after `requirePermission("newsletter.manage")` and its audit row) stores one fresh token hash per **active** subscriber (others skipped), at most 1000 per call; earlier tokens keep working until used (Phase 6 PR 6P) |
| `unsubscribe_newsletter(token_hash)` | service_role | The unsubscribe page's button: spends the token once, sets `subscribers.unsubscribed_at` and writes the withdrawal (`marketing`, `granted = false`, document `newsletter-unsubscribe`) to `consent_records` in one transaction; `unsubscribed`, `already` (the token is spent, nothing else changes) or `invalid` |
| `raise_on_email_problems()` | `pg_cron`, every 15 min | Fails the run (the alert) when an email stayed `queued` 10–25 minutes or one `failed` in the last 15 minutes, by `failed_at` since Phase 6 PR 6B (`*_phase6_backlog.sql`; `set_email_failed_at()` sets it on the change to `failed`, so a send that fails long after its claim still alerts) |
| `cron_failures(since)` | service_role (`security definer`; empty where `cron.job_run_details` does not exist, `to_regclass` guard) | Phase 6 PR 6B (`*_monitoring_housekeeping.sql`): kind `failed`, one row per failed `pg_cron` run started since `since` (job, start, return message cut to 500 characters), and kind `missed`, one row per active job overdue now (job, last successful start or null). `/api/cron/health-checks` emails the team once per row |
| `cron_job_overdue(schedule, reference, at)` | service_role (pure) | The missed-run rule: a job every N minutes (or every minute) is missed after 3 intervals, an hourly job after 3 hours, a daily job after 26 hours without a success; `reference` is the last success, or the first recorded start of a job that never succeeded; jobs without any run and other schedules are not judged |
| `cleanup_booking_access_tokens()` | `pg_cron` `booking-tokens-cleanup`, daily 20:05 UTC | Deletes `booking_access_tokens` where `least(coalesce(used_at, 'infinity'), expires_at) < now() - interval '30 days'`; returns the count |
| `trim_webhook_payloads()` | `pg_cron` `webhook-payload-trim`, daily 20:20 UTC | Sets `payload = '{}'` on events received more than 400 days ago whose payload is copied into `payments.raw_response`: `processed_at is not null and (error is null or error in ('duplicate_transaction', 'assigned'))`. `unmatched` events (read by `assign_unmatched_transfer()`), `failed`, `invalid_amount` and unfinished ones are never trimmed; rows are never deleted (idempotency proof) |
| `purge_cron_history()` | `pg_cron` `cron-history-purge`, daily 20:35 UTC | Deletes `cron.job_run_details` rows that ended more than 30 days ago (no-op without `pg_cron`) |
| `hold_minutes()`, `booking_prices_current()`, `take_seats()`, `release_seats()`, `refresh_payment_state()`, `log_booking_event()`, `check_draft_payload()` | service_role | Helpers of the booking functions (`*_booking_functions.sql`) |

Data-changing functions use `security definer` + `set search_path = ''` and grant execute to `service_role` only.

## Later tables (P1/P2)

`coupons`, `coupon_redemptions`, `wishlists`, `add_ons`, `quotes` (versioned), `tour_search_summary` (search speed-up), `suppliers`.

## Migrations

- Keep migrations in `supabase/migrations/` (Supabase CLI); naming `YYYYMMDDHHMMSS_short_description.sql`.
- Never edit an applied migration. Add a new one instead.
- After each migration, regenerate `src/types/database.types.ts`; CI fails if it is stale.
- New tables or policies need pgTAP tests in `supabase/tests/`.
