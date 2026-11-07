-- Checkout draft with consent, and the status poll (*_booking_consent.sql, spec Phase 4 decision 9).
begin;
select plan(11);

insert into public.departures (id, tour_id, start_date, end_date, capacity, price_adult)
select '21000000-0000-4000-8000-000000001901', t.id, public.vietnam_today() + 60, public.vietnam_today() + 62, 4, 10000000
  from public.tours t where t.code = 'VN-HLB-03';

create function pg_temp.payload(key text) returns jsonb language sql as $$
  select jsonb_build_object(
    'idempotency_key', key,
    'tour_id', (select tour_id from public.departures where id = '21000000-0000-4000-8000-000000001901'),
    'departure_id', '21000000-0000-4000-8000-000000001901',
    'locale', 'vi', 'adults', 1, 'children', 0, 'infants', 0, 'single_rooms', 0,
    'contact_name', 'Lê Minh', 'contact_email', key || '@example.test', 'contact_phone', '+84 900 000 000',
    'payment_plan', 'full', 'subtotal', 10000000, 'total', 10000000, 'deposit_amount', 10000000,
    'items', jsonb_build_array(jsonb_build_object('type', 'adult', 'unit_price', 10000000, 'quantity', 1, 'amount', 10000000)))
$$;

select throws_ok(
  $$ select public.create_checkout_draft(pg_temp.payload('consent-0'), 'terms-vi-x', '', false, null, null) $$,
  'P0001', 'consent_required', 'the privacy version is required'
);
select is((select count(*)::int from public.bookings where idempotency_key = 'consent-0'), 0, 'and nothing is created without it');

create temp table first as
select public.create_checkout_draft(pg_temp.payload('consent-1'), 'terms-vi-aaaa', 'privacy-vi-bbbb', false, '203.0.113.7', 'Playwright') as id;
select isnt((select id from first), null, 'the draft and its consent in one call');
select is((select terms_version from public.bookings where id = (select id from first)), 'terms-vi-aaaa', 'the booking keeps the terms version');
select is(
  (select array_agg(purpose::text order by purpose) from public.consent_records where booking_id = (select id from first)),
  array['terms', 'privacy'], 'terms and privacy, no marketing unless ticked'
);
select is(
  public.create_checkout_draft(pg_temp.payload('consent-1'), 'terms-vi-aaaa', 'privacy-vi-bbbb', true, null, null),
  (select id from first), 'a replay with the same key returns the same booking'
);
select is((select count(*)::int from public.consent_records where booking_id = (select id from first)), 2, 'and records nothing twice');

create temp table second as
select public.create_checkout_draft(pg_temp.payload('consent-2'), null, 'privacy-vi-bbbb', true, null, null) as id;
select is(
  (select array_agg(purpose::text order by purpose) from public.consent_records where booking_id = (select id from second)),
  array['privacy', 'marketing'], 'without a published terms page only privacy (and the ticked marketing box) is recorded'
);
select is(public.booking_checkout_status((select code from public.bookings where id = (select id from first))) ->> 'status', 'draft', 'the status for the result page');

set local role authenticated;
select throws_ok(
  $$ select public.create_checkout_draft(pg_temp.payload('consent-3'), null, 'privacy@x', false, null, null) $$,
  '42501', null, 'API roles cannot create checkout drafts'
);
select throws_ok($$ select public.booking_checkout_status('PTA-0000-0000') $$, '42501', null, 'or read a status by code');
reset role;

select * from finish();
rollback;
