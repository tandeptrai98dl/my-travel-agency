-- Checkout consent and status (*_booking_consent.sql, spec Phase 4 decision 9).
begin;
select plan(9);

insert into public.departures (id, tour_id, start_date, end_date, capacity, price_adult)
select '21000000-0000-4000-8000-000000001901', t.id, public.vietnam_today() + 60, public.vietnam_today() + 62, 4, 10000000
  from public.tours t where t.code = 'VN-HLB-03';

select isnt(public.create_draft_booking(jsonb_build_object(
  'idempotency_key', 'consent-1',
  'tour_id', (select tour_id from public.departures where id = '21000000-0000-4000-8000-000000001901'),
  'departure_id', '21000000-0000-4000-8000-000000001901',
  'locale', 'vi', 'adults', 1, 'children', 0, 'infants', 0, 'single_rooms', 0,
  'contact_name', 'Lê Minh', 'contact_email', 'consent-1@example.test', 'contact_phone', '+84 900 000 000',
  'payment_plan', 'full', 'subtotal', 10000000, 'total', 10000000, 'deposit_amount', 10000000,
  'items', jsonb_build_array(jsonb_build_object('type', 'adult', 'unit_price', 10000000, 'quantity', 1, 'amount', 10000000)))), null,
  'a draft to accept the terms for');

create function pg_temp.bid() returns uuid language sql as $$ select id from public.bookings where idempotency_key = 'consent-1' $$;

select throws_ok(
  $$ select public.record_booking_consent(pg_temp.bid(), '', 'privacy@1', false, null, null) $$,
  'P0001', 'consent_required', 'a version is required for both documents'
);
select lives_ok(
  $$ select public.record_booking_consent(pg_temp.bid(), 'terms@2026-11-07', 'privacy@2026-11-07', false, '203.0.113.7', 'Playwright') $$,
  'the service role records the acceptance'
);
select is((select terms_version from public.bookings where id = pg_temp.bid()), 'terms@2026-11-07', 'the booking keeps the terms version');
select is(
  (select array_agg(purpose::text order by purpose) from public.consent_records where booking_id = pg_temp.bid()),
  array['terms', 'privacy'], 'one row for terms and one for privacy, no marketing unless ticked'
);
select is(
  (select count(*)::int from public.consent_records where booking_id = pg_temp.bid() and subject_email = 'consent-1@example.test' and ip = '203.0.113.7'),
  2, 'with the address, IP and booking'
);
select is(public.booking_checkout_status((select code from public.bookings where id = pg_temp.bid())) ->> 'status', 'draft', 'the status for the result page');

set local role authenticated;
select throws_ok(
  $$ select public.record_booking_consent(pg_temp.bid(), 'terms@x', 'privacy@x', true, null, null) $$,
  '42501', null, 'API roles cannot write consent'
);
select throws_ok($$ select public.booking_checkout_status('PTA-0000-0000') $$, '42501', null, 'or read a status by code');
reset role;

select * from finish();
rollback;
