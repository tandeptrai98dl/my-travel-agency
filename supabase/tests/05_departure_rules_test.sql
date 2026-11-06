-- Departure rules (docs/specs/phase-2-catalog-admin.md step 16, ADR-026): capacity never below the
-- reserved seats, cancelling only by an MFA-verified admin and only without open bookings, and a
-- published group tour keeps a departure that is not cancelled.
begin;
select plan(18);

create function pg_temp.claims(uid uuid, aal text default 'aal1')
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text,
    true
  );
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000512', 'operator-d@example.test', '{}'),
  ('00000000-0000-4000-8000-000000000515', 'admin-d@example.test', '{}'),
  ('00000000-0000-4000-8000-000000000516', 'customer-d@example.test', '{}');
update public.profiles set role = 'operator' where id = '00000000-0000-4000-8000-000000000512';
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000515';

insert into public.media (id, path, mime_type, size_bytes, alt) values
  ('80000000-0000-4000-8000-000000000501', '2026/01/80000000-0000-4000-8000-000000000501.jpg',
   'image/jpeg', 1, '{"vi": "Ruộng bậc thang", "en": "Rice terraces"}');
-- A published group tour with two departures (D1, D2) and a draft group tour with one (D3).
insert into public.tours (id, code, type, scope, duration_days, duration_nights, from_price, hero_media_id) values
  ('40000000-0000-4000-8000-000000000501', 'D-PUB', 'group', 'domestic', 3, 2, 0, '80000000-0000-4000-8000-000000000501'),
  ('40000000-0000-4000-8000-000000000502', 'D-DRAFT', 'group', 'domestic', 3, 2, 0, null);
insert into public.tour_translations (tour_id, locale, slug, title, summary, seo_description, is_published) values
  ('40000000-0000-4000-8000-000000000501', 'vi', 'd-pub', 'Tour công khai', 'Tóm tắt', 'Mô tả', true);
insert into public.departures (id, tour_id, start_date, end_date, capacity, price_adult) values
  ('20000000-0000-4000-8000-000000000501', '40000000-0000-4000-8000-000000000501',
   current_date + 30, current_date + 32, 12, 9000000),
  ('20000000-0000-4000-8000-000000000502', '40000000-0000-4000-8000-000000000501',
   current_date + 60, current_date + 62, 12, 9000000),
  ('20000000-0000-4000-8000-000000000503', '40000000-0000-4000-8000-000000000502',
   current_date + 30, current_date + 32, 12, 9000000);
update public.tours set status = 'published' where code = 'D-PUB';
-- Seats move only through Postgres functions (ADR-012); set here as the owner.
update public.departures set seats_reserved = 5 where id = '20000000-0000-4000-8000-000000000501';
-- D1 has a booking awaiting payment; D2 only a draft (holds nothing).
insert into public.bookings (code, type, status, tour_id, departure_id, start_date, adults, contact_name, contact_email,
                             contact_phone, locale, subtotal, total, deposit_amount, payment_plan, tour_snapshot)
values
  ('PTA-TEST-0501', 'instant', 'pending_payment', '40000000-0000-4000-8000-000000000501',
   '20000000-0000-4000-8000-000000000501', current_date + 30, 2, 'Khách', 'khach@example.test', '0900000000',
   'vi', 18000000, 18000000, 5400000, 'deposit', '{}'),
  ('PTA-TEST-0502', 'instant', 'draft', '40000000-0000-4000-8000-000000000501',
   '20000000-0000-4000-8000-000000000502', current_date + 60, 2, 'Khách', 'khach@example.test', '0900000000',
   'vi', 18000000, 18000000, 5400000, 'deposit', '{}');

-- Operator ----------------------------------------------------------------------------------------
select pg_temp.claims('00000000-0000-4000-8000-000000000512');
set local role authenticated;
select throws_ok(
  $$ update public.departures set capacity = 4 where id = '20000000-0000-4000-8000-000000000501' $$,
  '23514', 'capacity cannot be below the reserved seats', 'capacity never goes below the reserved seats'
);
select lives_ok(
  $$ update public.departures set capacity = 5 where id = '20000000-0000-4000-8000-000000000501' $$,
  'capacity can equal the reserved seats'
);
select throws_ok(
  $$ update public.departures set status = 'cancelled' where id = '20000000-0000-4000-8000-000000000503' $$,
  '42501', null, 'an operator cannot cancel a departure'
);
select lives_ok(
  $$ update public.departures set status = 'closed', note = 'Đóng sớm' where id = '20000000-0000-4000-8000-000000000503' $$,
  'an operator closes a departure and edits its note'
);
select is(
  public.departure_has_open_bookings('20000000-0000-4000-8000-000000000501'),
  true,
  'staff see that a departure has bookings awaiting payment'
);
select is(
  public.departure_has_open_bookings('20000000-0000-4000-8000-000000000502'),
  false,
  'a draft booking holds nothing'
);

-- Admin below aal2 --------------------------------------------------------------------------------
reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000000515', 'aal1');
set local role authenticated;
with u as (update public.departures set status = 'cancelled' where id = '20000000-0000-4000-8000-000000000503' returning 1)
select is(count(*)::int, 0, 'an admin without MFA cannot write departures at all (RLS)') from u;

-- Admin at aal2 -----------------------------------------------------------------------------------
reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000000515', 'aal2');
set local role authenticated;
select throws_ok(
  $$ update public.departures set status = 'cancelled' where id = '20000000-0000-4000-8000-000000000501' $$,
  '23514', 'a departure with pending or confirmed bookings cannot be cancelled',
  'a departure with a booking awaiting payment cannot be cancelled'
);
select lives_ok(
  $$ update public.departures set status = 'cancelled' where id = '20000000-0000-4000-8000-000000000502' $$,
  'an MFA-verified admin cancels a departure without open bookings'
);
select lives_ok(
  $$ update public.departures set status = 'cancelled' where id = '20000000-0000-4000-8000-000000000503' $$,
  'the last departure of a draft tour can be cancelled'
);

-- Operator: reopening, and the last departure of a published group tour ----------------------------
reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000000512');
set local role authenticated;
select throws_ok(
  $$ update public.departures set status = 'open' where id = '20000000-0000-4000-8000-000000000502' $$,
  '42501', null, 'an operator cannot reopen a cancelled departure'
);
-- D1 is now the published tour's only departure that is not cancelled. The booking is moved off it
-- (as the owner) so only the last-departure rule applies.
reset role;
update public.bookings set departure_id = '20000000-0000-4000-8000-000000000502' where code = 'PTA-TEST-0501';
update public.departures set seats_reserved = 0 where id = '20000000-0000-4000-8000-000000000501';
select pg_temp.claims('00000000-0000-4000-8000-000000000512');
set local role authenticated;
select throws_ok(
  $$ delete from public.departures where id = '20000000-0000-4000-8000-000000000501' $$,
  '23514', 'a published group tour keeps at least one departure that is not cancelled',
  'the last departure of a published group tour cannot be deleted'
);
select lives_ok(
  $$ update public.departures set status = 'closed' where id = '20000000-0000-4000-8000-000000000501' $$,
  'closing the last departure keeps the tour publishable'
);

reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000000515', 'aal2');
set local role authenticated;
select throws_ok(
  $$ update public.departures set status = 'cancelled' where id = '20000000-0000-4000-8000-000000000501' $$,
  '23514', 'a published group tour keeps at least one departure that is not cancelled',
  'even an admin cannot cancel the last departure of a published group tour'
);
select lives_ok(
  $$ update public.departures set status = 'open' where id = '20000000-0000-4000-8000-000000000502' $$,
  'an MFA-verified admin reopens a cancelled departure'
);
-- With D2 open again, D1 is no longer the last one.
reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000000512');
set local role authenticated;
with d as (delete from public.departures where id = '20000000-0000-4000-8000-000000000501' returning 1)
select is(count(*)::int, 1, 'a departure that is not the last one can be deleted') from d;

-- Customers and anon --------------------------------------------------------------------------------
reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000000516');
set local role authenticated;
select is(
  public.departure_has_open_bookings('20000000-0000-4000-8000-000000000502'),
  false,
  'customers learn nothing about bookings from the helper'
);
reset role;
select ok(
  not has_function_privilege('anon', 'public.departure_has_open_bookings(uuid)', 'execute'),
  'anon cannot call the booking helper'
);

select * from finish();
rollback;
