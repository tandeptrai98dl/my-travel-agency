-- Access rules for anon, customers and staff roles (docs/specs/phase-0-foundation.md step 5,
-- docs/DATABASE.md "RLS policy summary", ARCHITECTURE.md permission matrix).
begin;
select plan(61);

-- Helpers (called only as the test owner; role switches happen inline) ------------------------
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

-- Fixtures (as the table owner, bypassing RLS) -------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000001', 'customer-a@example.test', '{"full_name": "Customer A", "locale": "en"}'),
  ('00000000-0000-4000-8000-000000000002', 'customer-b@example.test', '{}'),
  ('00000000-0000-4000-8000-000000000011', 'sales@example.test', '{}'),
  ('00000000-0000-4000-8000-000000000012', 'operator@example.test', '{}'),
  ('00000000-0000-4000-8000-000000000013', 'accountant@example.test', '{}'),
  ('00000000-0000-4000-8000-000000000014', 'editor@example.test', '{}'),
  ('00000000-0000-4000-8000-000000000015', 'admin@example.test', '{}');

update public.profiles set role = 'sales' where id = '00000000-0000-4000-8000-000000000011';
update public.profiles set role = 'operator' where id = '00000000-0000-4000-8000-000000000012';
update public.profiles set role = 'accountant' where id = '00000000-0000-4000-8000-000000000013';
update public.profiles set role = 'editor' where id = '00000000-0000-4000-8000-000000000014';
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000015';

insert into public.tours (id, code, type, scope, status, duration_days, duration_nights, from_price) values
  ('10000000-0000-4000-8000-000000000001', 'T-PUB', 'group', 'domestic', 'published', 3, 2, 5000000),
  ('10000000-0000-4000-8000-000000000002', 'T-DRAFT', 'group', 'domestic', 'draft', 3, 2, 5000000);

insert into public.tour_translations (tour_id, locale, slug, title, summary, is_published) values
  ('10000000-0000-4000-8000-000000000001', 'vi', 'tour-cong-khai', 'Tour công khai', 'Tóm tắt', true),
  ('10000000-0000-4000-8000-000000000001', 'en', 'public-tour', 'Public tour', 'Summary', false),
  ('10000000-0000-4000-8000-000000000002', 'vi', 'tour-nhap', 'Tour nháp', 'Tóm tắt', true);

insert into public.departures (id, tour_id, start_date, end_date, capacity, price_adult) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   current_date + 60, current_date + 62, 20, 5000000);

insert into public.bookings (
  id, code, type, tour_id, departure_id, start_date, customer_id, adults, contact_name,
  contact_email, contact_phone, locale, subtotal, total, deposit_amount, payment_plan,
  tour_snapshot
) values
  ('30000000-0000-4000-8000-000000000001', 'PTA-TEST-0001', 'instant',
   '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   current_date + 60, '00000000-0000-4000-8000-000000000001', 2, 'Customer A',
   'customer-a@example.test', '+84900000001', 'en', 10000000, 10000000, 3000000, 'deposit', '{}'),
  ('30000000-0000-4000-8000-000000000002', 'PTA-TEST-0002', 'instant',
   '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   current_date + 60, '00000000-0000-4000-8000-000000000002', 1, 'Customer B',
   'customer-b@example.test', '+84900000002', 'vi', 5000000, 5000000, 1500000, 'deposit', '{}');

insert into public.travellers (booking_id, full_name, is_lead) values
  ('30000000-0000-4000-8000-000000000001', 'Customer A', true),
  ('30000000-0000-4000-8000-000000000002', 'Customer B', true);

insert into public.payments (booking_id, provider, kind, status, amount, reference) values
  ('30000000-0000-4000-8000-000000000001', 'vnpay', 'deposit', 'succeeded', 3000000, 'PAY-TEST-0001');

insert into public.inquiries (id, code, name, email, locale, assigned_to) values
  ('40000000-0000-4000-8000-000000000001', 'INQ-TEST-0001', 'Lead', 'lead@example.test', 'vi', null),
  ('40000000-0000-4000-8000-000000000002', 'INQ-TEST-0002', 'Lead 2', 'lead2@example.test', 'en',
   '00000000-0000-4000-8000-000000000015');

insert into public.internal_notes (body, author_id, inquiry_id) values
  ('Note on the unassigned lead', '00000000-0000-4000-8000-000000000015', '40000000-0000-4000-8000-000000000001'),
  ('Note on a lead assigned to someone else', '00000000-0000-4000-8000-000000000015', '40000000-0000-4000-8000-000000000002');

insert into public.destinations (id, key, type, status) values
  ('50000000-0000-4000-8000-000000000001', 'test-published', 'country', 'published'),
  ('50000000-0000-4000-8000-000000000002', 'test-draft', 'country', 'draft');

insert into public.destination_translations (destination_id, locale, slug, name, is_published) values
  ('50000000-0000-4000-8000-000000000001', 'vi', 'test-cong-khai', 'Công khai', true),
  ('50000000-0000-4000-8000-000000000001', 'en', 'test-unpublished', 'Unpublished', false),
  ('50000000-0000-4000-8000-000000000002', 'vi', 'test-nhap', 'Nháp', true);

insert into public.settings (key, value, is_public) values
  ('test_public', '{}', true),
  ('test_private', '{}', false);

-- Profile trigger ----------------------------------------------------------------------------
select is(
  (select role::text || '/' || locale::text || '/' || coalesce(full_name, '')
   from public.profiles where id = '00000000-0000-4000-8000-000000000001'),
  'customer/en/Customer A',
  'a new auth user gets a customer profile with locale and name from metadata'
);

-- anon ---------------------------------------------------------------------------------------
set local role anon;

select is((select count(*)::int from public.bookings), 0, 'anon cannot read bookings');
select is((select count(*)::int from public.payments), 0, 'anon cannot read payments');
select is((select count(*)::int from public.inquiries), 0, 'anon cannot read inquiries');
select is((select count(*)::int from public.profiles), 0, 'anon cannot read profiles');
select is((select count(*)::int from public.travellers), 0, 'anon cannot read travellers');
select is(
  (select array_agg(code order by code) from public.tours where code like 'T-%'),
  array['T-PUB'],
  'anon reads published tours only (no draft tours)'
);
select is(
  (select array_agg(slug order by slug) from public.tour_translations
   where tour_id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')),
  array['tour-cong-khai'],
  'anon reads only published translations of published tours'
);
select is(
  (select count(*)::int from public.departures where tour_id = '10000000-0000-4000-8000-000000000001'),
  1,
  'anon reads departures of published tours'
);
select is(
  (select array_agg(key order by key) from public.destinations where key like 'test-%'),
  array['test-published'],
  'anon cannot read draft destinations'
);
select is(
  (select array_agg(slug order by slug) from public.destination_translations where slug like 'test-%'),
  array['test-cong-khai'],
  'anon cannot read unpublished destination translations'
);
select is(
  (select array_agg(key order by key) from public.settings where key like 'test_%'),
  array['test_public'],
  'anon reads only public settings'
);
select throws_ok(
  $$ insert into public.inquiries (code, name, email, locale) values ('INQ-X', 'X', 'x@example.test', 'vi') $$,
  '42501',
  null,
  'anon cannot insert inquiries directly (guest writes use the service role)'
);

-- customer -----------------------------------------------------------------------------------
reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select is(
  (select array_agg(code order by code) from public.bookings),
  array['PTA-TEST-0001'],
  'a customer reads only their own bookings'
);
select is((select count(*)::int from public.payments), 1, 'a customer reads payments of their own bookings');
select is((select count(*)::int from public.profiles), 1, 'a customer reads only their own profile');
select is((select count(*)::int from public.inquiries), 0, 'a customer cannot read inquiries');
select is((select count(*)::int from public.booking_events), 0, 'a customer cannot read the booking event timeline');

with u as (
  update public.profiles set full_name = 'Customer A2'
  where id = '00000000-0000-4000-8000-000000000001'
  returning 1
)
select is(count(*)::int, 1, 'a customer can update their own name') from u;

with u as (
  update public.profiles set full_name = 'Hijacked'
  where id = '00000000-0000-4000-8000-000000000002'
  returning 1
)
select is(count(*)::int, 0, 'a customer cannot update another customer''s profile') from u;

with u as (
  update public.travellers set dietary_notes = 'changed'
  where booking_id = '30000000-0000-4000-8000-000000000002'
  returning 1
)
select is(count(*)::int, 0, 'a customer cannot edit travellers on someone else''s booking') from u;
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'a customer cannot change their own role'
);
with u as (
  update public.travellers set dietary_notes = 'vegetarian'
  where booking_id = '30000000-0000-4000-8000-000000000001'
  returning 1
)
select is(count(*)::int, 1, 'a customer can edit travellers on their own upcoming booking') from u;
select throws_ok(
  $$ insert into public.travellers (booking_id, full_name)
     values ('30000000-0000-4000-8000-000000000002', 'Intruder') $$,
  '42501',
  null,
  'a customer cannot add travellers to someone else''s booking'
);
select throws_ok(
  $$ insert into public.payments (booking_id, provider, kind, amount, reference)
     values ('30000000-0000-4000-8000-000000000001', 'manual', 'full', 1, 'PAY-FAKE') $$,
  '42501',
  null,
  'a customer cannot record a payment'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('media', 'tests/customer-upload.jpg', '00000000-0000-4000-8000-000000000001') $$,
  '42501',
  null,
  'a customer cannot upload to the media bucket'
);

-- sales --------------------------------------------------------------------------------------
reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000000011');
set local role authenticated;

select is((select count(*)::int from public.bookings where code like 'PTA-TEST-%'), 2, 'sales reads all bookings');
select is((select count(*)::int from public.payments where reference = 'PAY-TEST-0001'), 1, 'sales reads payments');
select is((select count(*)::int from public.inquiries where code = 'INQ-TEST-0001'), 1, 'sales reads unassigned inquiries');
select is((select count(*)::int from public.payment_links), 0, 'sales cannot read payment links');
select is(
  (select array_agg(body order by body) from public.internal_notes
   where inquiry_id in ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002')),
  array['Note on the unassigned lead'],
  'sales cannot read notes on an inquiry assigned to someone else'
);
select throws_ok(
  $$ insert into public.internal_notes (body, author_id, inquiry_id)
     values ('Sneaky', '00000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000002') $$,
  '42501',
  null,
  'sales cannot add notes to an inquiry assigned to someone else'
);
select lives_ok(
  $$ insert into public.internal_notes (body, author_id, inquiry_id)
     values ('Called back', '00000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000001') $$,
  'sales can add notes to an unassigned inquiry'
);
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000011' $$,
  '42501',
  null,
  'sales cannot raise their own role'
);
select throws_ok(
  $$ update public.bookings set payment_state = 'paid', amount_paid = total
     where code = 'PTA-TEST-0002' $$,
  '42501',
  null,
  'sales cannot change payment state or amounts on a booking'
);
with u as (
  update public.bookings set special_requests = 'Window seats'
  where code = 'PTA-TEST-0002'
  returning 1
)
select is(count(*)::int, 1, 'sales can edit non-financial booking fields') from u;
select throws_ok(
  $$ insert into public.bookings (
       code, type, tour_id, start_date, adults, contact_name, contact_email, contact_phone,
       locale, subtotal, total, deposit_amount, payment_plan, tour_snapshot, status)
     values ('PTA-FAKE', 'instant', '10000000-0000-4000-8000-000000000001', current_date + 60, 2,
       'X', 'x@example.test', '+84', 'vi', 1, 1, 1, 'full', '{}', 'confirmed') $$,
  '42501',
  null,
  'sales cannot create bookings directly (Postgres functions only)'
);
select throws_ok(
  $$ insert into public.booking_items (booking_id, type, label, unit_price, quantity, amount)
     values ('30000000-0000-4000-8000-000000000002', 'discount', 'Discount', -1000000, 1, -1000000) $$,
  '42501',
  null,
  'sales cannot write price lines directly'
);

-- editor -------------------------------------------------------------------------------------
reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000000014');
set local role authenticated;

select is((select count(*)::int from public.bookings), 0, 'an editor cannot read bookings');
select is((select count(*)::int from public.tours where code like 'T-%'), 2, 'an editor reads draft tours too');
with u as (update public.tours set is_featured = true where code = 'T-DRAFT' returning 1)
select is(count(*)::int, 1, 'an editor can edit tour content') from u;

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('media', 'tests/editor-upload.jpg', '00000000-0000-4000-8000-000000000014') $$,
  '42501',
  null,
  'an editor cannot upload to the public media bucket (the server writes checked copies)'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('media-uploads', 'pending/00000000-0000-4000-8000-000000000014/x.jpg',
             '00000000-0000-4000-8000-000000000014') $$,
  '42501',
  null,
  'an editor cannot write to the upload staging bucket through the API'
);

reset role;
insert into storage.objects (bucket_id, name) values
  ('media', 'tests/server-copy.jpg'),
  ('media-uploads', 'pending/00000000-0000-4000-8000-000000000014/staged.jpg');
select pg_temp.claims('00000000-0000-4000-8000-000000000014');
set local role authenticated;

select is(
  (select count(*)::int from storage.objects where bucket_id = 'media' and name = 'tests/server-copy.jpg'),
  1,
  'an editor can see media objects (needed for delete and listing)'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'media-uploads'),
  0,
  'an editor cannot see staged uploads'
);
with u as (update storage.objects set metadata = '{}' where bucket_id = 'media' returning 1)
select is(count(*)::int, 0, 'an editor cannot overwrite media objects') from u;
select throws_ok(
  $$ update public.media set path = '2026/11/0f8fad5b-d9cb-469f-a165-70867728950e.png' $$,
  '42501', null, 'an editor cannot repoint a media row to another file'
);
select throws_ok(
  $$ insert into public.media (path, mime_type, size_bytes)
     values ('tests/anything.svg', 'image/svg+xml', 1) $$,
  '23514', null, 'a media row must use a server-generated path and an image type'
);
select throws_ok(
  $$ insert into public.media (path, mime_type, size_bytes, blur_data_url)
     values ('2026/11/0f8fad5b-d9cb-469f-a165-70867728950e.png', 'image/png', 1, 'javascript:alert(1)') $$,
  '23514', null, 'a blur placeholder must be a WebP data URL'
);
select is(public.can_act_as('{editor,admin}'), true, 'the staff media policies admit an editor');

-- Deleting goes through the Storage API (Supabase blocks direct DELETE on storage.objects); the
-- staff delete policy is checked in 00_schema_test.sql and the delete itself in the media E2E.

-- operator -----------------------------------------------------------------------------------
reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000000012');
set local role authenticated;

select is(public.can_act_as('{editor,admin}'), false, 'the staff media policies refuse an operator');

with u as (update public.tours set is_featured = true where code = 'T-PUB' returning 1)
select is(count(*)::int, 0, 'an operator cannot edit tour content') from u;

select throws_ok(
  $$ update public.departures set seats_reserved = 0
     where id = '20000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'an operator cannot change seats_reserved directly'
);

with u as (
  update public.departures set capacity = 18
  where id = '20000000-0000-4000-8000-000000000001'
  returning 1
)
select is(count(*)::int, 1, 'an operator can change departure capacity') from u;

-- accountant ---------------------------------------------------------------------------------
reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000000013', 'aal1');
set local role authenticated;

select is((select count(*)::int from public.payments), 0, 'an accountant without aal2 cannot read payments');

reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000000013', 'aal2');
set local role authenticated;

select is((select count(*)::int from public.payments where reference = 'PAY-TEST-0001'), 1, 'an accountant with aal2 reads payments');

-- admin --------------------------------------------------------------------------------------
reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000000015', 'aal1');
set local role authenticated;

with u as (
  update public.profiles set role = 'sales'
  where id = '00000000-0000-4000-8000-000000000002'
  returning 1
)
select is(count(*)::int, 0, 'an admin without aal2 cannot change roles (no row is visible)') from u;
select throws_ok(
  $$ insert into public.internal_notes (body, author_id, inquiry_id)
     values ('Admin note', '00000000-0000-4000-8000-000000000015', '40000000-0000-4000-8000-000000000001') $$,
  '42501',
  null,
  'an admin without aal2 cannot add notes'
);

reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000000015', 'aal2');
set local role authenticated;

select lives_ok(
  $$ update public.profiles set role = 'sales' where id = '00000000-0000-4000-8000-000000000002' $$,
  'an admin with aal2 can change roles'
);
select lives_ok(
  $$ insert into public.internal_notes (body, author_id, inquiry_id)
     values ('Admin note', '00000000-0000-4000-8000-000000000015', '40000000-0000-4000-8000-000000000002') $$,
  'an admin with aal2 can add notes to any inquiry'
);

reset role;
select is(
  (select role::text from public.profiles where id = '00000000-0000-4000-8000-000000000002'),
  'sales',
  'the role change by the admin was saved'
);

select * from finish();
rollback;
