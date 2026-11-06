-- Admin actions on bookings and payments (*_booking_admin.sql, spec Phase 4 PR 4F).
begin;
select plan(26);

create function pg_temp.claims(uid uuid, aal text default 'aal1')
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000001801', 'acc-b@example.test', '{}'),
  ('00000000-0000-4000-8000-000000001802', 'sales-b@example.test', '{}'),
  ('00000000-0000-4000-8000-000000001803', 'op-b@example.test', '{}'),
  ('00000000-0000-4000-8000-000000001804', 'ed-b@example.test', '{}');
update public.profiles set role = 'accountant' where id = '00000000-0000-4000-8000-000000001801';
update public.profiles set role = 'sales' where id = '00000000-0000-4000-8000-000000001802';
update public.profiles set role = 'operator' where id = '00000000-0000-4000-8000-000000001803';
update public.profiles set role = 'editor' where id = '00000000-0000-4000-8000-000000001804';

insert into public.departures (id, tour_id, start_date, end_date, capacity, price_adult)
select '21000000-0000-4000-8000-000000001801', t.id, public.vietnam_today() + 60, public.vietnam_today() + 62, 6, 10000000
  from public.tours t where t.code = 'VN-HLB-03';

create function pg_temp.draft(key text)
returns uuid
language sql
as $$
  select public.create_draft_booking(jsonb_build_object(
    'idempotency_key', key,
    'tour_id', (select tour_id from public.departures where id = '21000000-0000-4000-8000-000000001801'),
    'departure_id', '21000000-0000-4000-8000-000000001801',
    'locale', 'vi', 'adults', 1, 'children', 0, 'infants', 0, 'single_rooms', 0,
    'contact_name', 'Phạm Hà', 'contact_email', key || '@example.test', 'contact_phone', '+84 900 000 000',
    'payment_plan', 'deposit', 'subtotal', 10000000, 'total', 10000000, 'deposit_amount', 3000000,
    'items', jsonb_build_array(jsonb_build_object('type', 'adult', 'unit_price', 10000000, 'quantity', 1, 'amount', 10000000))))
$$;

create function pg_temp.b(key text)
returns public.bookings
language sql
as $$
  select * from public.bookings where idempotency_key = key
$$;

select isnt(pg_temp.draft('m1'), null, 'a booking to pay by hand');
select is(
  public.reserve_and_create_payment((pg_temp.b('m1')).id, 'bank_transfer', 'deposit') ->> 'booking_status',
  'pending_payment', 'waiting for a transfer'
);

-- Manual recording -------------------------------------------------------------------------------
select pg_temp.claims('00000000-0000-4000-8000-000000001801', 'aal1');
set local role authenticated;
select throws_ok(
  $$ select public.record_manual_payment((pg_temp.b('m1')).id, 3000000, 'cash', 'paid at the office') $$,
  '42501', null, 'an accountant below aal2 cannot record money'
);
reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000001802', 'aal1');
set local role authenticated;
select throws_ok(
  $$ select public.record_manual_payment((pg_temp.b('m1')).id, 3000000, 'cash', 'paid at the office') $$,
  '42501', null, 'sales cannot record money'
);
reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000001801', 'aal2');
set local role authenticated;
select throws_ok(
  $$ select public.record_manual_payment((pg_temp.b('m1')).id, 3000000, 'cash', ' ') $$,
  'P0001', 'note_required', 'a note is required'
);
select throws_ok(
  $$ select public.record_manual_payment((pg_temp.b('m1')).id, 3000000, 'vnpay', 'not a manual method') $$,
  'P0001', 'invalid_provider', 'only cash, manual or bank transfer are recorded by hand'
);
select is(
  public.record_manual_payment((pg_temp.b('m1')).id, 3000000, 'cash', 'paid at the office') ->> 'status',
  'confirmed', 'an MFA-verified accountant records the deposit and the booking is confirmed'
);
reset role;
select is(
  (select recorded_by from public.payments where booking_id = (pg_temp.b('m1')).id and reference like 'M%'),
  '00000000-0000-4000-8000-000000001801'::uuid, 'the payment names who recorded it'
);
select is(
  (select actor_id from public.audit_logs where action = 'payments.manual_record' order by created_at desc limit 1),
  '00000000-0000-4000-8000-000000001801'::uuid, 'and the audit log too'
);

-- Refunds --------------------------------------------------------------------------------------------
select pg_temp.claims('00000000-0000-4000-8000-000000001801', 'aal2');
set local role authenticated;
select throws_ok(
  $$ select public.record_refund((pg_temp.b('m1')).id, 3000001, 'bank_transfer', 'too much') $$,
  'P0001', 'refund_too_large', 'a refund never exceeds what was received'
);
select is(
  public.record_refund((pg_temp.b('m1')).id, 1000000, 'bank_transfer', 'goodwill refund') ->> 'payment_state',
  'partially_refunded', 'a partial refund'
);
select throws_ok(
  $$ select public.record_refund((pg_temp.b('m1')).id, 2000001, 'bank_transfer', 'more than is left') $$,
  'P0001', 'refund_too_large', 'and the cap counts earlier refunds'
);
select is(
  public.record_refund((pg_temp.b('m1')).id, 2000000, 'bank_transfer', 'the rest') ->> 'payment_state',
  'refunded', 'everything back is refunded'
);
reset role;

-- Unmatched transfers ---------------------------------------------------------------------------------
select isnt(pg_temp.draft('u1'), null, 'a booking paid with a wrong memo');
select is(
  public.reserve_and_create_payment((pg_temp.b('u1')).id, 'bank_transfer', 'deposit') ->> 'booking_status',
  'pending_payment', 'waiting for that transfer'
);
select is(
  public.record_payment_event('bank_transfer', 'sepay:9901', '{"id": 9901, "transferType": "in", "transferAmount": 3000000, "content": "chuyen tien tour"}',
                              '', 3000000, 'sepay:9901', true) ->> 'result',
  'unmatched', 'a transfer without a reference is kept as unmatched'
);
select pg_temp.claims('00000000-0000-4000-8000-000000001802', 'aal1');
set local role authenticated;
select throws_ok(
  format($$ select public.assign_unmatched_transfer(%L, %L, 'customer sent the receipt') $$,
         (select id from public.webhook_events where event_key = 'sepay:9901'), (pg_temp.b('u1')).id),
  '42501', null, 'sales cannot assign transfers'
);
reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000001801', 'aal2');
set local role authenticated;
select is(
  public.assign_unmatched_transfer((select id from public.webhook_events where event_key = 'sepay:9901'), (pg_temp.b('u1')).id,
                                   'customer sent the receipt') ->> 'status',
  'confirmed', 'an accountant assigns it with the webhook''s amount and the booking is confirmed'
);
select throws_ok(
  format($$ select public.assign_unmatched_transfer(%L, %L, 'again') $$,
         (select id from public.webhook_events where event_key = 'sepay:9901'), (pg_temp.b('u1')).id),
  'P0001', 'not_unmatched', 'a transfer is assigned once'
);
reset role;

-- Cancellation and the queue -------------------------------------------------------------------------
select isnt(pg_temp.draft('c1'), null, 'a booking to cancel');
select pg_temp.claims('00000000-0000-4000-8000-000000001802', 'aal1');
set local role authenticated;
select throws_ok(
  $$ select public.staff_cancel_booking((pg_temp.b('c1')).id, 'customer asked') $$,
  '42501', null, 'sales cannot cancel'
);
select lives_ok(
  $$ select public.request_cancellation((pg_temp.b('c1')).id, 'customer asked by phone') $$,
  'sales request a cancellation'
);
reset role;
select is((pg_temp.b('c1')).attention_reason, 'cancel_requested', 'which puts the booking in the queue');
select pg_temp.claims('00000000-0000-4000-8000-000000001803', 'aal1');
set local role authenticated;
select is(
  public.staff_cancel_booking((pg_temp.b('c1')).id, 'as the customer asked') ->> 'refund_percent', '80',
  'an operator cancels it with the suggested refund'
);
select lives_ok(
  $$ select public.resolve_attention((pg_temp.b('c1')).id, 'cancelled, nothing paid') $$,
  'and clears it from the queue with a note'
);
reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000001804', 'aal1');
set local role authenticated;
select throws_ok(
  $$ select public.resolve_attention((pg_temp.b('m1')).id, 'editors do not work bookings') $$,
  '42501', null, 'editors cannot work the queue'
);
reset role;

select * from finish();
rollback;
