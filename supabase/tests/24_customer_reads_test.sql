-- Phase 5 PR 5A (*_customer_reads.sql): customers read their bookings only through definer
-- functions with a fixed set of columns, edit travellers through one function, get earlier
-- bookings attached only once GoTrue confirmed their address, and cannot write consent or
-- deletion state on their profile.
begin;
select plan(39);

create function pg_temp.claims(uid uuid, email text default null)
returns void
language sql
as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aal', 'aal1', 'email', email)::text, true);
$$;

-- Fixtures ----------------------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000002401', 'cust-a@example.test', '{"full_name": "Cust A"}', now()),
  ('00000000-0000-4000-8000-000000002402', 'cust-b@example.test', '{}', now()),
  -- Signed up, never confirmed.
  ('00000000-0000-4000-8000-000000002403', 'cust-c@example.test', '{}', null),
  ('00000000-0000-4000-8000-000000002404', 'cust-d@example.test', '{}', now());

-- Two published-tour bookings: A's own (upcoming) and B's; plus guest bookings with the addresses
-- of A, C and B (B's already owned by B).
insert into public.bookings (id, code, type, status, tour_id, departure_id, start_date, customer_id, adults, children,
                             contact_name, contact_email, contact_phone, locale, subtotal, total, deposit_amount,
                             payment_plan, tour_snapshot, needs_attention, attention_reason, utm, idempotency_key,
                             cancellation_policy_snapshot)
select v.id, v.code, 'instant', v.status::public.booking_status, d.tour_id, d.id, v.start_date, v.customer_id, 2, 0,
       'Contact', v.email, '+84900000000', 'vi', 10000000, 10000000, 3000000, 'deposit',
       jsonb_build_object('code', 'T-24', 'title', 'Tour 24', 'end_date', v.start_date + 2),
       true, 'overpaid', '{"source": "secret"}', 'idem-' || v.code,
       '{"summary": {"vi": "Hoàn 80%", "en": "80% back"}}'
  from (values
    ('50000000-0000-4000-8000-000000002401'::uuid, 'PTA-2611-9401', 'confirmed', current_date + 40,
     '00000000-0000-4000-8000-000000002401'::uuid, 'cust-a@example.test'),
    ('50000000-0000-4000-8000-000000002402'::uuid, 'PTA-2611-9402', 'confirmed', current_date + 40,
     '00000000-0000-4000-8000-000000002402'::uuid, 'cust-b@example.test'),
    ('50000000-0000-4000-8000-000000002403'::uuid, 'PTA-2611-9403', 'pending_payment', current_date + 40,
     null, 'CUST-A@example.test'),
    ('50000000-0000-4000-8000-000000002404'::uuid, 'PTA-2611-9404', 'confirmed', current_date + 40,
     null, 'cust-c@example.test'),
    ('50000000-0000-4000-8000-000000002405'::uuid, 'PTA-2611-9405', 'completed', current_date - 30,
     '00000000-0000-4000-8000-000000002401'::uuid, 'cust-a@example.test')
  ) as v(id, code, status, start_date, customer_id, email)
  cross join lateral (select id, tour_id from public.departures order by start_date limit 1) d;

insert into public.booking_items (booking_id, type, label, unit_price, quantity, amount) values
  ('50000000-0000-4000-8000-000000002401', 'adult', 'Người lớn', 5000000, 2, 10000000);
insert into public.payments (booking_id, provider, kind, status, amount, reference, raw_response, note, provider_txn_id)
values ('50000000-0000-4000-8000-000000002401', 'vnpay', 'deposit', 'succeeded', 3000000, 'PTA26119401-01',
        '{"secret": true}', 'internal note', 'TXN-24');
insert into public.travellers (booking_id, full_name, is_lead) values
  ('50000000-0000-4000-8000-000000002402', 'B lead', true);

-- Privileges ----------------------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.customer_bookings()', 'execute')
  and not has_function_privilege('anon', 'public.customer_booking(text)', 'execute')
  and not has_function_privilege('anon', 'public.save_customer_travellers(text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.attach_customer_bookings()', 'execute')
  and not has_function_privilege('anon', 'public.set_marketing_consent(boolean, text)', 'execute'),
  'anon cannot call the customer functions'
);
select ok(
  has_function_privilege('authenticated', 'public.customer_bookings()', 'execute')
  and has_function_privilege('authenticated', 'public.customer_booking(text)', 'execute')
  and has_function_privilege('authenticated', 'public.save_customer_travellers(text, jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.attach_customer_bookings()', 'execute'),
  'signed-in users can call the customer functions'
);
select ok(
  not has_function_privilege('authenticated', 'public.record_signup_consent(uuid, text, boolean, inet, text)', 'execute')
  and has_function_privilege('service_role', 'public.record_signup_consent(uuid, text, boolean, inet, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.current_customer_id()', 'execute'),
  'sign-up consent and the helpers are for the service role only'
);
select is(
  (select count(*)::int from pg_policies where schemaname = 'public'
     and policyname in ('bookings: customer read own', 'booking_items: customer read own', 'payments: customer read own',
                        'travellers: customer read own', 'travellers: customer insert own before departure',
                        'travellers: customer update own before departure')),
  0,
  'the six direct customer policies are gone'
);

-- Customer A reads ----------------------------------------------------------------------------------
select pg_temp.claims('00000000-0000-4000-8000-000000002401');
set local role authenticated;

select is((select count(*)::int from public.bookings), 0, 'a customer reads no booking rows directly');
select is((select count(*)::int from public.booking_items), 0, 'a customer reads no price lines directly');
select is((select count(*)::int from public.payments), 0, 'a customer reads no payment rows directly');
select is((select count(*)::int from public.travellers), 0, 'a customer reads no traveller rows directly');
select is(
  (select array_agg(code order by code) from public.customer_bookings()),
  array['PTA-2611-9401', 'PTA-2611-9405'],
  'customer_bookings() returns only the caller''s bookings'
);
select is(
  (select tour_title from public.customer_bookings() where code = 'PTA-2611-9401'),
  'Tour 24',
  'the list carries the snapshot title'
);
select is(public.customer_booking('PTA-2611-9402'), null, 'another customer''s code returns nothing');
select is(public.customer_booking('PTA-NOPE'), null, 'an unknown code returns nothing');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.customer_booking('PTA-2611-9401')) k
    where k in ('needs_attention', 'attention_reason', 'assigned_to', 'idempotency_key', 'utm', 'customer_id')),
  null,
  'the detail has no internal booking fields'
);
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.customer_booking('PTA-2611-9401') -> 'payments' -> 0) k),
  array['amount', 'created_at', 'kind', 'paid_at', 'provider', 'status'],
  'payments carry only amount, kind, provider, status and dates'
);
select is(
  public.customer_booking('PTA-2611-9401') -> 'cancellation_summary' ->> 'en',
  '80% back',
  'the detail carries the cancellation policy summary'
);
select is((public.customer_booking('PTA-2611-9401') ->> 'travellers_editable')::boolean, true, 'an upcoming booking is editable');
select is((public.customer_booking('PTA-2611-9405') ->> 'travellers_editable')::boolean, false, 'a past booking is not');

-- Travellers ----------------------------------------------------------------------------------------
select is(
  public.save_customer_travellers('PTA-2611-9401',
    '[{"full_name": "A lead", "is_lead": true, "nationality": "VN"}, {"full_name": "A two", "date_of_birth": "1990-05-01"}]'),
  2,
  'a customer saves travellers on their upcoming booking'
);
select is(
  (public.customer_booking('PTA-2611-9401') -> 'travellers' -> 0 ->> 'full_name'),
  'A lead',
  'the saved travellers are read back, lead first'
);
select throws_ok(
  $$ select public.save_customer_travellers('PTA-2611-9401', '[{"full_name": "X", "is_lead": true, "passport_number": "B123"}]') $$,
  '22023', 'invalid_traveller', 'unknown keys such as a passport number are refused'
);
select throws_ok(
  $$ select public.save_customer_travellers('PTA-2611-9401', '[{"full_name": "1", "is_lead": true}, {"full_name": "2"}, {"full_name": "3"}]') $$,
  '22023', 'too_many_travellers', 'more travellers than the party are refused'
);
select throws_ok(
  $$ select public.save_customer_travellers('PTA-2611-9401', '[{"full_name": "1"}, {"full_name": "2"}]') $$,
  '22023', 'lead_required', 'exactly one lead traveller is required'
);
select throws_ok(
  $$ select public.save_customer_travellers('PTA-2611-9401', '[{"full_name": "  ", "is_lead": true}]') $$,
  '22023', 'invalid_traveller', 'a blank name is refused'
);
select throws_ok(
  $$ select public.save_customer_travellers('PTA-2611-9401', '[{"full_name": "Kid", "is_lead": true, "date_of_birth": "2999-01-01"}]') $$,
  '22023', 'invalid_traveller', 'a birth date in the future is refused'
);
select throws_ok(
  $$ select public.save_customer_travellers('PTA-2611-9405', '[{"full_name": "Late", "is_lead": true}]') $$,
  'P0001', 'travellers_locked', 'travellers cannot change after the departure date'
);
select throws_ok(
  $$ select public.save_customer_travellers('PTA-2611-9402', '[{"full_name": "Intruder", "is_lead": true}]') $$,
  'P0002', 'not_found', 'another customer''s booking cannot be edited'
);
select throws_ok(
  $$ insert into public.travellers (booking_id, full_name) values ('50000000-0000-4000-8000-000000002401', 'Direct') $$,
  '42501', null, 'travellers cannot be inserted directly'
);

-- Profile columns -----------------------------------------------------------------------------------
select throws_ok(
  $$ update public.profiles set marketing_consent = true where id = '00000000-0000-4000-8000-000000002401' $$,
  '42501', null, 'a customer cannot set marketing_consent directly'
);
select throws_ok(
  $$ update public.profiles set deletion_requested_at = now() where id = '00000000-0000-4000-8000-000000002401' $$,
  '42501', null, 'a customer cannot set deletion_requested_at'
);
select lives_ok(
  $$ select public.set_marketing_consent(true, 'privacy-vi-0123456789abcdef') $$,
  'set_marketing_consent() changes the choice'
);
reset role;
select ok(
  (select marketing_consent from public.profiles where id = '00000000-0000-4000-8000-000000002401')
  and exists (select 1 from public.consent_records where profile_id = '00000000-0000-4000-8000-000000002401'
                and purpose = 'marketing' and granted and document_version = 'privacy-vi-0123456789abcdef'),
  'the flag and its consent row are written together'
);

-- Attaching earlier bookings ------------------------------------------------------------------------
-- A forged JWT `email` claim and a changed profiles.email are both ignored: the address is the
-- confirmed auth.users email of auth.uid().
update public.profiles set email = 'cust-c@example.test' where id = '00000000-0000-4000-8000-000000002404';
select pg_temp.claims('00000000-0000-4000-8000-000000002404', 'cust-c@example.test');
set local role authenticated;
select is(public.attach_customer_bookings(), 0, 'neither the JWT email claim nor profiles.email attaches anything');
reset role;

select pg_temp.claims('00000000-0000-4000-8000-000000002403');
set local role authenticated;
select is(public.attach_customer_bookings(), 0, 'an unconfirmed address attaches nothing');
reset role;

select pg_temp.claims('00000000-0000-4000-8000-000000002401');
set local role authenticated;
select is(public.attach_customer_bookings(), 1, 'a confirmed address attaches its unowned guest booking (any letter case)');
select is(public.attach_customer_bookings(), 0, 'attaching again changes nothing');
reset role;
select is(
  (select customer_id from public.bookings where code = 'PTA-2611-9402'),
  '00000000-0000-4000-8000-000000002402'::uuid,
  'bookings owned by another account never move'
);
select ok(
  exists (select 1 from public.booking_events where booking_id = '50000000-0000-4000-8000-000000002403'
            and type = 'attached_to_account' and actor_id = '00000000-0000-4000-8000-000000002401'),
  'attaching writes a booking event with the customer as actor'
);

-- A deleted profile reads nothing (its access token may outlive the deletion).
update public.profiles set deleted_at = now() where id = '00000000-0000-4000-8000-000000002402';
select pg_temp.claims('00000000-0000-4000-8000-000000002402');
set local role authenticated;
select is((select count(*)::int from public.customer_bookings()), 0, 'a deleted profile reads no bookings');
reset role;

-- Sign-up consent (service role) ----------------------------------------------------------------
set local role service_role;
select public.record_signup_consent('00000000-0000-4000-8000-000000002403', 'privacy-en-aaaaaaaaaaaaaaaa', true, '203.0.113.9', 'UA');
select public.record_signup_consent('00000000-0000-4000-8000-000000002403', 'privacy-en-aaaaaaaaaaaaaaaa', true, null, null);
reset role;
select is(
  (select array_agg(purpose::text order by purpose) from public.consent_records where profile_id = '00000000-0000-4000-8000-000000002403'),
  array['privacy', 'marketing'],
  'sign-up records privacy and marketing once each'
);

select * from finish();
rollback;
