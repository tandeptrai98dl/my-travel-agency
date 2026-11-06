-- Extensions, enums and the shared updated_at trigger function (docs/DATABASE.md).
-- Extensions live in the `extensions` schema. pg_cron registers in pg_catalog, as Supabase
-- requires; it is enabled without jobs until Phase 4.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

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

-- Shared trigger: keeps updated_at current on every table that has the column.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
