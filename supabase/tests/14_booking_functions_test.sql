-- Booking core functions (docs/specs/phase-4-booking-payments.md decisions 1–5, ADR-012, ADR-033).
-- Runs as the owner (the functions are granted to service_role only; the privilege checks are at
-- the end). Concurrency (two customers on the last seat, ten copies of one IPN) is tested against
-- the real stack in tests/e2e/booking-core.spec.ts.
begin;
select plan(60);

-- Fixtures: a 4-seat departure 60 days out on a published group tour --------------------------------
insert into public.departures (id, tour_id, start_date, end_date, capacity, price_adult, price_child, single_supplement)
select '21000000-0000-4000-8000-000000001401', t.id, public.vietnam_today() + 60, public.vietnam_today() + 62,
       4, 10000000, 7000000, 2000000
  from public.tours t where t.code = 'VN-HLB-03';

create function pg_temp.payload(key text, adults int, children int default 0, plan text default 'deposit', price bigint default 10000000)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'idempotency_key', key,
    'tour_id', (select tour_id from public.departures where id = '21000000-0000-4000-8000-000000001401'),
    'departure_id', '21000000-0000-4000-8000-000000001401',
    'locale', 'vi', 'adults', adults, 'children', children, 'infants', 0, 'single_rooms', 0,
    'contact_name', 'Nguyễn Lan', 'contact_email', key || '@example.test', 'contact_phone', '+84 900 000 000',
    'payment_plan', plan,
    'subtotal', price * adults + 7000000 * children, 'total', price * adults + 7000000 * children,
    'deposit_amount', case when plan = 'deposit' then ceil((price * adults + 7000000 * children) * 0.3 / 1000) * 1000 else price * adults + 7000000 * children end,
    'items', jsonb_build_array(jsonb_build_object('type', 'adult', 'unit_price', price, 'quantity', adults, 'amount', price * adults))
             || case when children > 0 then jsonb_build_array(jsonb_build_object('type', 'child', 'unit_price', 7000000, 'quantity', children, 'amount', 7000000 * children)) else '[]'::jsonb end
  )
$$;

create function pg_temp.seats()
returns int
language sql
as $$
  select seats_reserved from public.departures where id = '21000000-0000-4000-8000-000000001401'
$$;

create function pg_temp.booking(key text)
returns public.bookings
language sql
as $$
  select * from public.bookings where idempotency_key = key
$$;

create function pg_temp.pay(ref text, amount bigint, event text, ok boolean default true)
returns jsonb
language sql
as $$
  select public.record_payment_event(
    (select provider from public.payments where reference = ref), event, '{"test": true}', ref, amount, event, ok)
$$;

-- Codes and drafts ---------------------------------------------------------------------------------
select matches(public.next_booking_code(), '^PTA-[0-9]{4}-[0-9]{4,}$', 'booking codes look like PTA-2611-0042');

select isnt(public.create_draft_booking(pg_temp.payload('a', 2)), null, 'a draft is created');
select is(public.create_draft_booking(pg_temp.payload('a', 2)), (pg_temp.booking('a')).id, 'the same idempotency key returns the same draft');
select is((select count(*)::int from public.bookings where idempotency_key = 'a'), 1, 'only one draft exists for the key');
select is(pg_temp.seats(), 0, 'a draft takes no seats');
select is((select count(*)::int from public.booking_items where booking_id = (pg_temp.booking('a')).id), 1, 'its price lines are stored');
select is((pg_temp.booking('a')).tour_snapshot ->> 'code', 'VN-HLB-03', 'the tour is snapshotted');
select is((pg_temp.booking('a')).cancellation_policy_snapshot -> 'rules' -> 0 ->> 'refund_percent', '80', 'and its cancellation policy');
select throws_ok(
  $$ select public.create_draft_booking(pg_temp.payload('wrong-price', 1, 0, 'deposit', 9000000)) $$,
  'P0001', 'price_changed', 'a draft priced differently from the departure is refused'
);

-- Holds ----------------------------------------------------------------------------------------------
select is(
  (public.reserve_and_create_payment((pg_temp.booking('a')).id, 'vnpay', 'deposit') ->> 'amount')::bigint,
  6000000::bigint, 'the deposit payment asks for the deposit'
);
select is((pg_temp.booking('a')).status, 'pending_payment', 'paying moves the booking to pending_payment');
select is(pg_temp.seats(), 2, 'and holds its seats');
select ok(
  (pg_temp.booking('a')).hold_expires_at between now() + interval '29 minutes' and now() + interval '31 minutes',
  'a VNPay hold lasts 30 minutes'
);
select is(
  (select reference from public.payments where booking_id = (pg_temp.booking('a')).id),
  replace((pg_temp.booking('a')).code, '-', '') || '01', 'the reference is the code without dashes and the attempt'
);

select isnt(public.create_draft_booking(pg_temp.payload('b', 3)), null, 'a second draft for three travellers');
select throws_ok(
  $$ select public.reserve_and_create_payment((pg_temp.booking('b')).id, 'vnpay', 'full') $$,
  'P0001', 'sold_out', 'three seats do not fit in the two left'
);
select is(pg_temp.seats(), 2, 'a refused hold takes nothing');

-- Price change between draft and payment.
select isnt(public.create_draft_booking(pg_temp.payload('c', 1)), null, 'a one-traveller draft');
update public.departures set price_adult = 11000000 where id = '21000000-0000-4000-8000-000000001401';
select throws_ok(
  $$ select public.reserve_and_create_payment((pg_temp.booking('c')).id, 'vnpay', 'deposit') $$,
  'P0001', 'price_changed', 'a draft at an old price cannot be paid'
);
update public.departures set price_adult = 10000000 where id = '21000000-0000-4000-8000-000000001401';

-- Method switch keeps the seats; the old attempt is cancelled.
select is(
  public.reserve_and_create_payment((pg_temp.booking('a')).id, 'bank_transfer', 'deposit') ->> 'booking_status',
  'pending_payment', 'switching to a bank transfer'
);
select is(
  (select array_agg(status::text order by reference) from public.payments where booking_id = (pg_temp.booking('a')).id),
  array['cancelled', 'pending'], 'the VNPay attempt is cancelled, the transfer is pending'
);
select is(pg_temp.seats(), 2, 'the seats stay held');
select ok(
  (pg_temp.booking('a')).hold_expires_at > now() + interval '119 minutes', 'the transfer hold lasts two hours'
);

-- Gateway results ------------------------------------------------------------------------------------
create temporary table refs as
select reference, status from public.payments where booking_id = (pg_temp.booking('a')).id;

select is(
  pg_temp.pay((select reference from refs where status = 'pending'), 6000000, 'evt-1') ->> 'status',
  'confirmed', 'the deposit received confirms the booking'
);
select is((pg_temp.booking('a')).payment_state, 'deposit_paid', 'the payment state follows the money');
select is(
  pg_temp.pay((select reference from refs where status = 'pending'), 6000000, 'evt-1') ->> 'result',
  'duplicate', 'a repeated event is a duplicate'
);
select is(
  (select count(*)::int from public.payments where booking_id = (pg_temp.booking('a')).id and status = 'succeeded'),
  1, 'and records no second payment'
);

-- The old VNPay attempt paid after the switch: a new row, flagged.
select is(
  pg_temp.pay((select reference from refs where status = 'cancelled'), 6000000, 'evt-2') ->> 'attention_reason',
  'paid_after_switch', 'money for the cancelled attempt is flagged'
);
select is(
  (select status::text from public.payments where reference = (select reference from refs where status = 'cancelled')),
  'cancelled', 'the cancelled attempt is not overwritten'
);
select is((pg_temp.booking('a')).amount_paid, 12000000::bigint, 'the money is counted');

-- A second success for an attempt already paid: a new row, overpaid, the first unchanged.
select is(
  pg_temp.pay((select reference from refs where status = 'pending'), 6000000, 'evt-3') ->> 'attention_reason',
  'overpaid', 'a second transfer with the same memo is flagged as overpaid'
);
select is(
  (select amount from public.payments where reference = (select reference from refs where status = 'pending')),
  6000000::bigint, 'the succeeded row keeps its amount'
);
select is(
  (select count(*)::int from public.payments where booking_id = (pg_temp.booking('a')).id and status = 'succeeded'),
  3, 'each amount received is its own payment row'
);
select is(
  public.record_payment_event('bank_transfer', 'evt-5', '{}', 'NOPE99', 100000, null, true) ->> 'result',
  'unmatched', 'an unknown memo is unmatched'
);
select is((select error from public.webhook_events where event_key = 'evt-5'), 'unmatched', 'and kept for the accountant');

-- A failed result, then an underpayment.
select isnt(public.create_draft_booking(pg_temp.payload('d', 1)), null, 'a draft for one');
select is(
  (public.reserve_and_create_payment((pg_temp.booking('d')).id, 'vnpay', 'deposit') ->> 'amount')::bigint,
  3000000::bigint, 'its deposit'
);
select is(
  pg_temp.pay((select reference from public.payments where booking_id = (pg_temp.booking('d')).id), 3000000, 'evt-6', false) ->> 'result',
  'failed', 'a verified failure is recorded as failed'
);
select is((pg_temp.booking('d')).status, 'pending_payment', 'the booking keeps its hold after a failure');
select is(pg_temp.seats(), 3, 'and its seat');
select is(
  public.reserve_and_create_payment((pg_temp.booking('d')).id, 'vnpay', 'deposit') ->> 'booking_status',
  'pending_payment', 'the customer tries again'
);
select is(
  pg_temp.pay((select reference from public.payments where booking_id = (pg_temp.booking('d')).id and status = 'pending'), 1000000, 'evt-7') ->> 'attention_reason',
  'underpaid', 'too little money is flagged'
);
select is((pg_temp.booking('d')).status, 'pending_payment', 'and does not confirm');

-- Expiry and late payments -------------------------------------------------------------------------
update public.bookings set hold_expires_at = now() - interval '1 minute' where idempotency_key = 'd';
select ok(public.expire_holds() >= 1, 'expire_holds expires the lapsed hold');
select is(pg_temp.seats(), 2, 'and releases its seat');
-- The rest of its deposit arrives late, with a seat still free: confirmed again.
select is(
  public.record_payment_event('vnpay', 'evt-8', '{}',
    (select reference from public.payments where booking_id = (pg_temp.booking('d')).id and status = 'succeeded'),
    2000000, 'evt-8', true) ->> 'status',
  'confirmed', 'a late payment that finds a seat confirms'
);

-- Cancellation ---------------------------------------------------------------------------------------
select is(
  (public.cancel_booking((pg_temp.booking('a')).id, null, 'customer request') ->> 'refund_percent')::int,
  80, 'cancelling 60 days out suggests the 80 % tier'
);
select is(
  pg_temp.pay((select reference from refs where status = 'pending'), 500000, 'evt-9') ->> 'attention_reason',
  'paid_after_cancel', 'money for a cancelled booking is flagged'
);
select is((pg_temp.booking('a')).status, 'cancelled', 'and never confirms it');

-- Attempt limit, quotes without a departure, completion -----------------------------------------
select isnt(public.create_draft_booking(pg_temp.payload('e', 1)), null, 'a draft to retry with');
select lives_ok(
  $$ select public.reserve_and_create_payment((pg_temp.booking('e')).id, 'vnpay', 'deposit') from generate_series(1, 5) $$,
  'five payment attempts are allowed'
);
select throws_ok(
  $$ select public.reserve_and_create_payment((pg_temp.booking('e')).id, 'bank_transfer', 'deposit') $$,
  'P0001', 'too_many_attempts', 'a sixth attempt is refused, so a hold cannot be extended forever'
);
select public.cancel_booking((pg_temp.booking('e')).id, null, 'test cleanup');

insert into public.bookings (code, type, status, tour_id, start_date, adults, contact_name, contact_email, contact_phone,
                             locale, subtotal, total, deposit_amount, payment_plan, tour_snapshot, idempotency_key, quote_expires_at)
select public.next_booking_code(), 'quoted', 'quoted', t.id, public.vietnam_today() + 90, 2, 'Trần Minh', 'q@example.test',
       '+84 900 000 001', 'en', 80000000, 80000000, 24000000, 'deposit', '{}', 'q', now() + interval '3 days'
  from public.tours t where t.code = 'VN-HLB-03';
select is(
  public.reserve_and_create_payment((pg_temp.booking('q')).id, 'bank_transfer', 'deposit') ->> 'booking_status',
  'pending_payment', 'a quoted booking can be paid'
);
select is(pg_temp.seats(), 1, 'a quote without a departure takes no seats');

insert into public.departures (id, tour_id, start_date, end_date, capacity, price_adult)
select '21000000-0000-4000-8000-000000001402', t.id, public.vietnam_today() - 6, public.vietnam_today() - 3, 10, 5000000
  from public.tours t where t.code = 'VN-HLB-03';
update public.departures set seats_reserved = 1 where id = '21000000-0000-4000-8000-000000001402';
insert into public.bookings (code, type, status, tour_id, departure_id, start_date, adults, contact_name, contact_email,
                             contact_phone, locale, subtotal, total, deposit_amount, amount_paid, payment_plan, tour_snapshot, idempotency_key)
select public.next_booking_code(), 'instant', 'confirmed', t.id, '21000000-0000-4000-8000-000000001402',
       public.vietnam_today() - 6, 1, 'Lê Hoa', 'done@example.test', '+84 900 000 002', 'vi', 5000000, 5000000, 5000000,
       5000000, 'full', '{}', 'done'
  from public.tours t where t.code = 'VN-HLB-03';
select ok(public.complete_bookings() >= 1, 'complete_bookings runs');
select is((pg_temp.booking('done')).status, 'completed', 'a confirmed trip that has ended is completed');

-- Seat invariant and privileges ---------------------------------------------------------------------
select is(public.check_seat_invariant(), 0, 'seats match the bookings after the whole sequence');
update public.departures set seats_reserved = seats_reserved + 1 where id = '21000000-0000-4000-8000-000000001401';
select is(public.check_seat_invariant(), 1, 'a mismatch is reported');
select is(
  (select changes ->> 'expected' from public.audit_logs where action = 'departures.seat_mismatch'
     and entity_id = '21000000-0000-4000-8000-000000001401' order by created_at desc limit 1),
  '1', 'and written to the audit log with the expected seats'
);
select ok(
  not has_function_privilege('authenticated', 'public.reserve_and_create_payment(uuid, public.payment_provider, public.payment_kind)', 'execute')
  and not has_function_privilege('anon', 'public.record_payment_event(public.payment_provider, text, jsonb, text, bigint, text, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.create_draft_booking(jsonb)', 'execute'),
  'API roles cannot call the booking functions'
);

select * from finish();
rollback;
