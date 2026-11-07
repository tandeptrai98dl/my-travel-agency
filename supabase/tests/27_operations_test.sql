-- Phase 5 PR 5D (*_operations.sql): departures below their minimum, the dashboard per role, the
-- passenger list export, open deletion requests with blockers, consent history and the
-- personal-data export.
begin;
select plan(47);

create function pg_temp.as_user(uid uuid, aal text default 'aal1')
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
$$;

-- Fixtures ----------------------------------------------------------------------------------------
-- 01 sales, 02 sales_manager, 03 operator, 04 accountant, 05 editor, 06 admin, 07 customer (waits),
-- 08 a second seller.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000002701', 'ops-sales@example.test', '{}', now()),
  ('00000000-0000-4000-8000-000000002702', 'ops-manager@example.test', '{}', now()),
  ('00000000-0000-4000-8000-000000002703', 'ops-operator@example.test', '{}', now()),
  ('00000000-0000-4000-8000-000000002704', 'ops-accountant@example.test', '{}', now()),
  ('00000000-0000-4000-8000-000000002705', 'ops-editor@example.test', '{}', now()),
  ('00000000-0000-4000-8000-000000002706', 'ops-admin@example.test', '{}', now()),
  ('00000000-0000-4000-8000-000000002707', 'ops-customer@example.test', '{"full_name": "Trần Thị Bình"}', now()),
  ('00000000-0000-4000-8000-000000002708', 'ops-sales2@example.test', '{}', now());
update public.profiles p set role = v.role::public.user_role
  from (values ('01', 'sales'), ('02', 'sales_manager'), ('03', 'operator'), ('04', 'accountant'), ('05', 'editor'),
               ('06', 'admin'), ('08', 'sales')) v(n, role)
 where p.id = ('00000000-0000-4000-8000-0000000027' || v.n)::uuid;
update public.profiles set full_name = 'Trần Thị Bình', phone = '+84900002707' where id = '00000000-0000-4000-8000-000000002707';

-- A tour that needs 8 travellers, with a departure in 10 days (2 confirmed) and one in 40 days.
update public.tours set min_pax_to_operate = 8 where code = 'VN-HLB-03';
insert into public.departures (id, tour_id, start_date, end_date, capacity, price_adult)
select v.id, t.id, public.vietnam_today() + v.days, public.vietnam_today() + v.days + 2, 12, 10000000
  from (values ('27000000-0000-4000-8000-000000000001'::uuid, 10), ('27000000-0000-4000-8000-000000000002'::uuid, 40)) v(id, days)
  cross join (select id from public.tours where code = 'VN-HLB-03') t;

insert into public.bookings (id, code, type, status, tour_id, departure_id, start_date, customer_id, assigned_to, adults, children, infants,
                             contact_name, contact_email, contact_phone, locale, subtotal, total, deposit_amount, amount_paid,
                             payment_plan, payment_state, balance_due_date, tour_snapshot)
select v.id, v.code, v.type::public.booking_type, v.status::public.booking_status, t.id, v.departure_id, public.vietnam_today() + 10,
       v.customer_id, v.assigned_to, v.adults, 0, v.infants, v.name, v.email, '+84900002799', 'vi', 20000000, 20000000, 6000000, v.paid,
       'deposit', v.state::public.booking_payment_state, public.vietnam_today() - 1, jsonb_build_object('title', 'Vịnh Hạ Long')
  from (values
    -- Confirmed, 2 adults + 1 infant, one traveller entered, balance overdue: the customer's own.
    ('27100000-0000-4000-8000-000000000001'::uuid, 'PTA-2711-0001', 'instant', 'confirmed', '27000000-0000-4000-8000-000000000001'::uuid,
     '00000000-0000-4000-8000-000000002707'::uuid, null::uuid, 2, 1, 'Trần Thị Bình', 'ops-customer@example.test', 6000000::bigint, 'deposit_paid'),
    -- A quote of seller 01 awaiting payment.
    ('27100000-0000-4000-8000-000000000002'::uuid, 'PTA-2711-0002', 'quoted', 'quoted', null::uuid,
     null::uuid, '00000000-0000-4000-8000-000000002701'::uuid, 1, 0, 'Khách báo giá', 'quote27@example.test', 0::bigint, 'unpaid'),
    -- A quote of seller 08.
    ('27100000-0000-4000-8000-000000000003'::uuid, 'PTA-2711-0003', 'quoted', 'quoted', null::uuid,
     null::uuid, '00000000-0000-4000-8000-000000002708'::uuid, 1, 0, 'Khách khác', 'other27@example.test', 0::bigint, 'unpaid')
  ) as v(id, code, type, status, departure_id, customer_id, assigned_to, adults, infants, name, email, paid, state)
  cross join (select id from public.tours where code = 'VN-HLB-03') t;
insert into public.travellers (booking_id, full_name, date_of_birth, nationality, dietary_notes, is_lead) values
  ('27100000-0000-4000-8000-000000000001', '=HYPERLINK("x")', '1990-01-02', 'VN', 'Chay', true);

insert into public.inquiries (id, code, name, email, locale, source, assigned_to, created_at, first_responded_at) values
  ('27200000-0000-4000-8000-000000000001', 'INQ-T27-0001', 'A', 'ops-customer@example.test', 'vi', 'contact', '00000000-0000-4000-8000-000000002701', now() - interval '2 hours', now() - interval '1 hour'),
  ('27200000-0000-4000-8000-000000000002', 'INQ-T27-0002', 'B', 'b27@example.test', 'vi', 'contact', null, now(), null),
  ('27200000-0000-4000-8000-000000000003', 'INQ-T27-0003', 'C', 'c27@example.test', 'vi', 'contact', '00000000-0000-4000-8000-000000002708', now() - interval '5 hours', now() - interval '2 hours');
insert into public.consent_records (subject_email, profile_id, purpose, granted, document_version, ip) values
  ('ops-customer@example.test', null, 'privacy', true, 'privacy-vi-0123456789abcdef', '203.0.113.7');
insert into public.payments (booking_id, provider, kind, status, amount, reference, paid_at) values
  ('27100000-0000-4000-8000-000000000001', 'bank_transfer', 'deposit', 'succeeded', 6000000, 'PTA27110001T1', now());
update public.profiles set deletion_requested_at = now() where id = '00000000-0000-4000-8000-000000002707';

-- Privileges --------------------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.departures_below_minimum(int)', 'execute')
    and not has_function_privilege('authenticated', 'public.customer_deletion_blockers(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.customer_data_export(uuid)', 'execute')
    and has_function_privilege('service_role', 'public.customer_data_export(uuid)', 'execute'),
  'the job and export helpers are service-role only'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_dashboard()', 'execute')
    and not has_function_privilege('anon', 'public.admin_dashboard()', 'execute')
    and not has_function_privilege('anon', 'public.export_departure_passengers(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.admin_deletion_requests(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.customer_consents(uuid)', 'execute'),
  'the role-checked reads are for sessions, never anon'
);

-- Departures below their minimum ------------------------------------------------------------------
select is(
  (select (d ->> 'confirmed')::int from jsonb_array_elements(public.departures_below_minimum(21)) d
    where d ->> 'departure_id' = '27000000-0000-4000-8000-000000000001'),
  2, 'a departure in 10 days with 2 of 8 is below its minimum (infants not counted)'
);
select is(
  (select (d ->> 'days_left')::int from jsonb_array_elements(public.departures_below_minimum(21)) d
    where d ->> 'departure_id' = '27000000-0000-4000-8000-000000000001'),
  10, 'days left are Vietnam days'
);
select ok(
  not exists (select 1 from jsonb_array_elements(public.departures_below_minimum(21)) d
               where d ->> 'departure_id' = '27000000-0000-4000-8000-000000000002'),
  'one 40 days away is outside the window'
);
update public.departures set status = 'guaranteed' where id = '27000000-0000-4000-8000-000000000001';
select ok(
  not exists (select 1 from jsonb_array_elements(public.departures_below_minimum(21)) d
               where d ->> 'departure_id' = '27000000-0000-4000-8000-000000000001'),
  'a guaranteed departure is not alerted'
);
update public.departures set status = 'open' where id = '27000000-0000-4000-8000-000000000001';

-- Dashboard per role ------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-000000002701');
set local role authenticated;
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.admin_dashboard()) k), array['sales'],
  'sales see the sales section only'
);
select is(public.admin_dashboard() #>> '{sales,scope}', 'own', 'their own numbers');
select is((public.admin_dashboard() #>> '{sales,quotes_awaiting_payment}')::int, 1, 'their quote awaiting payment, not another seller''s');
select is((public.admin_dashboard() #>> '{sales,open_inquiries}')::int, 1, 'their open inquiries');
select ok((public.admin_dashboard() #>> '{sales,unassigned_inquiries}')::int >= 1, 'and the unassigned ones');
select is((public.admin_dashboard() #>> '{sales,median_first_response_minutes}')::int, 60, 'their median first response');
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-000000002702');
set local role authenticated;
select is(public.admin_dashboard() #>> '{sales,scope}', 'team', 'a sales manager sees the team');
select ok((public.admin_dashboard() #>> '{sales,quotes_awaiting_payment}')::int >= 2, 'every seller''s quotes');
select ok((public.admin_dashboard() #>> '{sales,new_bookings}')::int >= 3, 'and every new booking');
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-000000002703');
set local role authenticated;
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.admin_dashboard()) k), array['operations'],
  'operators see operations only'
);
select is(
  (select jsonb_build_object('confirmed', d -> 'confirmed', 'party', d -> 'party', 'travellers', d -> 'travellers')
     from jsonb_array_elements(public.admin_dashboard() #> '{operations,departures}') d
    where d ->> 'id' = '27000000-0000-4000-8000-000000000001'),
  '{"confirmed": 2, "party": 3, "travellers": 1}'::jsonb,
  'a departure in the next 14 days with seats, party and travellers filled'
);
select ok((public.admin_dashboard() #>> '{operations,below_minimum}')::int >= 1, 'departures below their minimum are counted');
select ok((public.admin_dashboard() #>> '{operations,missing_travellers}')::int >= 1, 'bookings missing traveller details are counted');
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-000000002704', 'aal1');
set local role authenticated;
select throws_ok($$ select public.admin_dashboard() $$, '42501', null, 'an accountant below aal2 gets nothing');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-000000002704', 'aal2');
set local role authenticated;
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.admin_dashboard()) k), array['finance'],
  'an MFA-verified accountant sees finance only'
);
select ok((public.admin_dashboard() #>> '{finance,revenue_month}')::bigint >= 6000000, 'revenue collected this month');
select ok((public.admin_dashboard() #>> '{finance,money_attention}')::int >= 1, 'the overdue balance is part of the money attention count');
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-000000002705');
set local role authenticated;
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.admin_dashboard()) k), array['content'],
  'editors see content only'
);
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-000000002706', 'aal1');
set local role authenticated;
select throws_ok($$ select public.admin_dashboard() $$, '42501', null, 'an admin below aal2 gets nothing');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-000000002706', 'aal2');
set local role authenticated;
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.admin_dashboard()) k),
  array['admin', 'content', 'finance', 'operations', 'sales'],
  'an MFA-verified admin sees every section'
);
select ok((public.admin_dashboard() #>> '{admin,deletion_requests}')::int >= 1, 'with the open deletion requests');
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-000000002707');
set local role authenticated;
select throws_ok($$ select public.admin_dashboard() $$, '42501', null, 'customers get nothing');
reset role;

-- Deletion requests -------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-000000002706', 'aal2');
set local role authenticated;
select is(
  (select r -> 'blockers' from jsonb_array_elements(public.admin_deletion_requests('00000000-0000-4000-8000-000000002707')) r),
  '["balance_due"]'::jsonb,
  'an open request lists its blockers (the overdue balance)'
);
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-000000002702');
set local role authenticated;
select throws_ok($$ select public.admin_deletion_requests(null) $$, '42501', null, 'sales managers cannot list deletion requests');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-000000002706', 'aal2');
set local role authenticated;
select throws_ok(
  $$ select public.admin_anonymise_customer('00000000-0000-4000-8000-000000002707', 'Khách yêu cầu') $$,
  '55000', 'blocked', 'the admin cannot finish while a blocker remains'
);
reset role;
select is(public.request_customer_deletion('00000000-0000-4000-8000-000000002707'), array['balance_due'], 'request_customer_deletion() returns the same blockers');

-- Passenger list ----------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-000000002701');
set local role authenticated;
select throws_ok($$ select public.export_departure_passengers('27000000-0000-4000-8000-000000000001') $$, '42501', null, 'sales cannot export passengers');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-000000002705');
set local role authenticated;
select throws_ok($$ select public.export_departure_passengers('27000000-0000-4000-8000-000000000001') $$, '42501', null, 'editors cannot export passengers');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-000000002703');
set local role authenticated;
select is(
  public.export_departure_passengers('27000000-0000-4000-8000-000000000001'),
  '[{"full_name": "=HYPERLINK(\"x\")", "date_of_birth": "1990-01-02", "nationality": "VN", "dietary_notes": "Chay",
     "booking_code": "PTA-2711-0001", "is_lead": true, "phone": "+84900002799", "party": 3}]'::jsonb,
  'an operator gets the travellers of confirmed bookings, the lead''s phone and no passport field'
);
select throws_ok($$ select public.export_departure_passengers('27000000-0000-4000-8000-0000000000ff') $$, 'P0002', null, 'an unknown departure');
reset role;
select is(
  (select changes from public.audit_logs where action = 'departures.passenger_export' and entity_id = '27000000-0000-4000-8000-000000000001'
      and actor_id = '00000000-0000-4000-8000-000000002703'),
  '{"count": 1}'::jsonb, 'the export is audit-logged with the actor, departure and row count'
);
insert into public.bookings (code, type, status, tour_id, departure_id, start_date, adults, contact_name, contact_email, contact_phone,
                             locale, subtotal, total, deposit_amount, payment_plan, tour_snapshot)
select 'PTA-2711-0004', 'instant', 'confirmed', tour_id, id, start_date, 1, 'Lê Văn Cường', 'c27b@example.test', '+84900002704',
       'vi', 1, 1, 1, 'full', '{}' from public.departures where id = '27000000-0000-4000-8000-000000000001';
select pg_temp.as_user('00000000-0000-4000-8000-000000002703');
set local role authenticated;
select is(
  (select r - 'party' from jsonb_array_elements(public.export_departure_passengers('27000000-0000-4000-8000-000000000001')) r
    where r ->> 'booking_code' = 'PTA-2711-0004'),
  '{"full_name": "Lê Văn Cường", "date_of_birth": null, "nationality": null, "dietary_notes": null, "booking_code": "PTA-2711-0004", "is_lead": true, "phone": "+84900002704"}'::jsonb,
  'a booking without traveller details shows its contact as the lead'
);
reset role;

-- Consent history and the data export -------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-000000002704', 'aal2');
set local role authenticated;
select is(
  (select jsonb_agg(c - 'created_at') from jsonb_array_elements(public.customer_consents('00000000-0000-4000-8000-000000002707')) c),
  '[{"purpose": "privacy", "granted": true, "document_version": "privacy-vi-0123456789abcdef"}]'::jsonb,
  'staff who read customers see consents by confirmed address, without the IP'
);
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-000000002705');
set local role authenticated;
select is(public.customer_consents('00000000-0000-4000-8000-000000002707'), '[]'::jsonb, 'editors see no consents');
reset role;

select is(
  (select jsonb_build_object(
     'email', e #>> '{profile,confirmed_email}',
     'bookings', jsonb_array_length(e -> 'bookings'),
     'travellers', jsonb_array_length(e -> 'travellers'),
     'consents', jsonb_array_length(e -> 'consents'),
     'inquiries', jsonb_array_length(e -> 'inquiries'))
     from public.customer_data_export('00000000-0000-4000-8000-000000002707') e),
  '{"email": "ops-customer@example.test", "bookings": 1, "travellers": 1, "consents": 1, "inquiries": 1}'::jsonb,
  'the export holds the profile, bookings, travellers, consents and inquiries of the account and its confirmed address'
);
select ok(
  (select e::text not like '%needs_attention%' and e::text not like '%idempotency%' and e #>> '{consents,0,ip}' = '203.0.113.7'
     from public.customer_data_export('00000000-0000-4000-8000-000000002707') e),
  'the export leaves internal columns out and keeps the customer''s own consent details'
);
select throws_ok($$ select public.customer_data_export('00000000-0000-4000-8000-000000002701') $$, 'P0002', null, 'staff accounts are not exported here');

-- Once the balance is paid and the trip is over, the admin finishes the request.
update public.bookings set amount_paid = total, payment_state = 'paid', status = 'completed', start_date = public.vietnam_today() - 1
 where id = '27100000-0000-4000-8000-000000000001';
select pg_temp.as_user('00000000-0000-4000-8000-000000002706', 'aal2');
set local role authenticated;
select is(
  (select r -> 'blockers' from jsonb_array_elements(public.admin_deletion_requests('00000000-0000-4000-8000-000000002707')) r),
  '[]'::jsonb, 'the blockers clear on their own'
);
select lives_ok(
  $$ select public.admin_anonymise_customer('00000000-0000-4000-8000-000000002707', 'Chuyến đi đã kết thúc') $$,
  'then the admin finishes the SQL step'
);
select is(
  (select r ->> 'profile_deleted' from jsonb_array_elements(public.admin_deletion_requests('00000000-0000-4000-8000-000000002707')) r),
  'true', 'the request stays open until the Auth user is deleted too'
);
reset role;
update auth.users set deleted_at = now() where id = '00000000-0000-4000-8000-000000002707';
select pg_temp.as_user('00000000-0000-4000-8000-000000002706', 'aal2');
set local role authenticated;
select is(public.admin_deletion_requests('00000000-0000-4000-8000-000000002707'), '[]'::jsonb, 'and leaves the list after every step');
reset role;

select * from finish();
rollback;
