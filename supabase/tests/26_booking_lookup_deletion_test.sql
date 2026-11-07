-- Phase 5 PR 5B (*_booking_lookup_deletion.sql): the guest lookup token, the deletion request and
-- its blockers, every table of spec decision 8 in anonymise_customer(), the admin wrapper, the
-- email-sync trigger after GoTrue's soft delete, reviews audited without names, and the #45 review
-- fix of the first response after spam.
begin;
select plan(57);

create function pg_temp.claims(uid uuid, aal text default 'aal1')
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
$$;

-- Fixtures ----------------------------------------------------------------------------------------
-- X: the customer who deletes; Y: one who must wait; S: a seller; A: an admin.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000002601', 'del-x@example.test', '{"full_name": "Nguyễn Văn An"}', now()),
  ('00000000-0000-4000-8000-000000002602', 'del-y@example.test', '{}', now()),
  ('00000000-0000-4000-8000-000000002603', 'del-sales@example.test', '{}', now()),
  ('00000000-0000-4000-8000-000000002604', 'del-admin@example.test', '{}', now());
update public.profiles set full_name = 'Nguyễn Văn An', phone = '+84900000001', country = 'VN', marketing_consent = true
 where id = '00000000-0000-4000-8000-000000002601';
update public.profiles set role = 'sales' where id = '00000000-0000-4000-8000-000000002603';
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000002604';

insert into public.inquiries (id, code, name, email, locale, source, message, phone) values
  ('26000000-0000-4000-8000-000000000001', 'INQ-T26-0001', 'Nguyễn Văn An', 'DEL-X@example.test', 'vi', 'contact', 'Gọi tôi nhé', '+84900000001'),
  ('26000000-0000-4000-8000-000000000002', 'INQ-T26-0002', 'Nguyễn Văn An', 'del-x@example.test', 'vi', 'tour_inquiry', 'Báo giá', null),
  ('26000000-0000-4000-8000-000000000003', 'INQ-T26-0003', 'Spam', 'spam26@example.test', 'en', 'contact', null, null);

insert into public.bookings (id, code, type, status, tour_id, start_date, customer_id, inquiry_id, adults, contact_name,
                             contact_email, contact_phone, locale, subtotal, total, deposit_amount, amount_paid,
                             payment_plan, tour_snapshot)
select v.id, v.code, 'instant', v.status::public.booking_status, t.id, v.start_date, v.customer_id, v.inquiry_id, 1, 'Nguyễn Văn An',
       v.email, '+84900000001', 'vi', 10000000, 10000000, 3000000, v.paid, 'deposit', jsonb_build_object('title', 'Tour 26')
  from (values
    -- X: a past trip of the account, and a cancelled guest booking (linked to inquiry 2).
    ('51000000-0000-4000-8000-000000002601'::uuid, 'PTA-2611-9601', 'completed', current_date - 60,
     '00000000-0000-4000-8000-000000002601'::uuid, null::uuid, 'del-x@example.test', 10000000::bigint),
    ('51000000-0000-4000-8000-000000002602'::uuid, 'PTA-2611-9602', 'cancelled', current_date + 30,
     null::uuid, '26000000-0000-4000-8000-000000000002'::uuid, 'Del-X@Example.test', 0::bigint),
    -- Y: a balance due, a payment in progress and a fully paid trip ahead.
    ('51000000-0000-4000-8000-000000002603'::uuid, 'PTA-2611-9603', 'confirmed', current_date + 40,
     '00000000-0000-4000-8000-000000002602'::uuid, null::uuid, 'del-y@example.test', 3000000::bigint),
    ('51000000-0000-4000-8000-000000002604'::uuid, 'PTA-2611-9604', 'pending_payment', current_date + 50,
     null::uuid, null::uuid, 'del-y@example.test', 0::bigint),
    ('51000000-0000-4000-8000-000000002605'::uuid, 'PTA-2611-9605', 'confirmed', current_date + 60,
     '00000000-0000-4000-8000-000000002602'::uuid, null::uuid, 'del-y@example.test', 10000000::bigint)
  ) as v(id, code, status, start_date, customer_id, inquiry_id, email, paid)
  cross join lateral (select id from public.tours order by code limit 1) t;

insert into public.reviews (id, booking_id, author_name, rating, content, locale, status) values
  ('52000000-0000-4000-8000-000000002601', '51000000-0000-4000-8000-000000002601', 'Nguyễn Văn An', 5, 'Tuyệt vời', 'vi', 'approved');
-- An audit row written before this migration still carried the name.
insert into public.audit_logs (action, entity_type, entity_id, changes) values
  ('reviews.insert', 'reviews', '52000000-0000-4000-8000-000000002601', '{"after": {"author_name": "Nguyễn Văn An", "author_country": "Việt Nam", "title": "Kỳ nghỉ của An", "content": "Tuyệt vời", "rating": 5}}');
insert into public.internal_notes (body, author_id, inquiry_id) values
  ('Note on the open inquiry', '00000000-0000-4000-8000-000000002603', '26000000-0000-4000-8000-000000000001'),
  ('Note on the quoted inquiry', '00000000-0000-4000-8000-000000002603', '26000000-0000-4000-8000-000000000002');
insert into public.internal_notes (body, author_id, customer_id) values
  ('Prefers mornings', '00000000-0000-4000-8000-000000002603', '00000000-0000-4000-8000-000000002601');
insert into public.subscribers (email, locale, confirmed_at) values ('del-x@example.test', 'vi', now());
insert into public.consent_records (subject_email, profile_id, purpose, granted, document_version) values
  ('del-x@example.test', '00000000-0000-4000-8000-000000002601', 'privacy', true, 'privacy-vi-0123456789abcdef');
insert into public.email_logs (to_email, template, subject, status) values ('Del-X@example.test', 'booking_confirmed', 'S', 'sent');
insert into public.booking_access_tokens (booking_id, purpose, token_hash, expires_at, used_at) values
  ('51000000-0000-4000-8000-000000002601', 'email', repeat('a', 64), now() + interval '1 day', null),
  ('51000000-0000-4000-8000-000000002601', 'email', repeat('b', 64), now() + interval '1 day', now());

-- Privileges --------------------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.issue_booking_lookup(text, text, text, int)', 'execute')
    and not has_function_privilege('authenticated', 'public.issue_booking_lookup(text, text, text, int)', 'execute')
    and has_function_privilege('service_role', 'public.issue_booking_lookup(text, text, text, int)', 'execute'),
  'only the service role issues lookup tokens'
);
select ok(
  not has_function_privilege('authenticated', 'public.anonymise_customer(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.request_customer_deletion(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.customer_deletion_state(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.confirmed_customer_email(uuid)', 'execute'),
  'the deletion steps are service-role only'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_anonymise_customer(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.admin_anonymise_customer(uuid, text)', 'execute'),
  'the admin wrapper is callable by sessions (it checks the role), never by anon'
);

-- Lookup --------------------------------------------------------------------------------------------
select is(public.issue_booking_lookup('PTA-2611-9603', 'someone@example.test', repeat('1', 64)), null, 'a wrong address gets nothing');
select is(public.issue_booking_lookup('PTA-2611-0000', 'del-y@example.test', repeat('2', 64)), null, 'a wrong code gets nothing');
select is(
  public.issue_booking_lookup(' pta-2611-9603 ', ' DEL-Y@example.test ', repeat('3', 64)) ->> 'booking_id',
  '51000000-0000-4000-8000-000000002603', 'code and address match in any case and with spaces'
);
select is(
  (select purpose from public.booking_access_tokens where token_hash = repeat('3', 64)), 'lookup', 'the token is a lookup token'
);
select ok(
  (select expires_at between now() + interval '29 minutes' and now() + interval '31 minutes'
     from public.booking_access_tokens where token_hash = repeat('3', 64)),
  'it is valid for the configured 30 minutes'
);
select is(
  (public.issue_booking_lookup('PTA-2611-9603', 'del-y@example.test', repeat('4', 64)) ->> 'locale'), 'vi', 'the booking''s language comes back'
);
select isnt(public.issue_booking_lookup('PTA-2611-9603', 'del-y@example.test', repeat('5', 64)), null, 'a third open token');
select is(public.issue_booking_lookup('PTA-2611-9603', 'del-y@example.test', repeat('6', 64)), null, 'not a fourth while three are open');
select is(
  public.redeem_booking_access_token('PTA-2611-9603', repeat('3', 64)) ->> 'code', 'PTA-2611-9603', 'a lookup token opens the booking once'
);
select throws_ok(
  $$ select public.redeem_booking_access_token('PTA-2611-9603', repeat('3', 64)) $$, 'P0001', 'link_used', 'and only once'
);
select isnt(public.issue_booking_lookup('PTA-2611-9603', 'del-y@example.test', repeat('7', 64)), null, 'a used token frees a place');
select throws_ok(
  $$ select public.issue_booking_lookup('PTA-2611-9603', 'del-y@example.test', 'not-a-hash') $$, 'P0001', 'invalid_token', 'only SHA-256 hashes are stored'
);
update public.booking_access_tokens set used_at = now() where booking_id = '51000000-0000-4000-8000-000000002603' and purpose = 'lookup';
select ok(
  (select e between now() + interval '119 minutes' and now() + interval '121 minutes'
     from (select (public.issue_booking_lookup('PTA-2611-9603', 'del-y@example.test', repeat('9', 64), 500) ->> 'expires_at')::timestamptz as e offset 0) x),
  'an explicit validity is capped at 120 minutes'
);

-- Deletion request and blockers -------------------------------------------------------------------
select throws_ok($$ select public.request_customer_deletion('00000000-0000-4000-8000-000000002603') $$, 'P0002', null, 'staff accounts are not deleted here');
select is(public.request_customer_deletion('00000000-0000-4000-8000-000000002601'), '{}'::text[], 'nothing open: the deletion can run now');
select ok(
  (select deletion_requested_at is not null from public.profiles where id = '00000000-0000-4000-8000-000000002601'), 'the request is recorded'
);
select is(
  public.request_customer_deletion('00000000-0000-4000-8000-000000002602'), '{balance_due,open_payment,upcoming_trip}'::text[],
  'a balance, a payment in progress (found by the confirmed address) and a trip ahead make it wait'
);
update public.bookings set needs_attention = true, attention_reason = 'cancel_requested' where id = '51000000-0000-4000-8000-000000002605';
select ok(
  not ('attention' = any (public.request_customer_deletion('00000000-0000-4000-8000-000000002602'))),
  'a cancellation request is not an open money reason'
);
update public.bookings set needs_attention = true, attention_reason = 'underpaid' where id = '51000000-0000-4000-8000-000000002605';
select ok(
  'attention' = any (public.request_customer_deletion('00000000-0000-4000-8000-000000002602')), 'an open money reason makes it wait'
);
select is(
  public.customer_deletion_state('00000000-0000-4000-8000-000000002601'),
  '{"role": "customer", "requested": true, "auth_deleted": false, "profile_deleted": false}'::jsonb, 'the state before the steps'
);

-- anonymise_customer() ------------------------------------------------------------------------------
select is(public.name_initials('Nguyễn Văn An'), 'N. V. A.', 'names become initials');
select is(public.name_initials('N. V. A.'), 'N. V. A.', 'and stay so');
select is(
  (public.anonymise_customer('00000000-0000-4000-8000-000000002601') ->> 'profile')::int, 1, 'the SQL step runs'
);
select ok(
  (select full_name is null and phone is null and country is null and avatar_url is null and not marketing_consent and deleted_at is not null
          and email = 'deleted+00000000-0000-4000-8000-000000002601@invalid.local'
     from public.profiles where id = '00000000-0000-4000-8000-000000002601'),
  'profiles: personal fields cleared, placeholder address, deleted_at set'
);
select is(
  (select customer_id from public.bookings where id = '51000000-0000-4000-8000-000000002601'), null, 'bookings: unlinked from the account'
);
select is(
  (select contact_email from public.bookings where id = '51000000-0000-4000-8000-000000002602'), 'Del-X@Example.test',
  'bookings: kept with their contact details for the retention period'
);
select is((select author_name from public.reviews where id = '52000000-0000-4000-8000-000000002601'), 'N. V. A.', 'reviews: initials only');
select is(
  (select count(*)::int from public.audit_logs where entity_id = '52000000-0000-4000-8000-000000002601' and changes::text like '%Nguyễn%'),
  0, 'audit_logs: no review row keeps the name'
);
select ok(
  (select bool_and(not (changes -> 'after' ?| array['author_country', 'title', 'content']) and (changes -> 'after' ->> 'rating') = '5')
     from public.audit_logs where entity_id = '52000000-0000-4000-8000-000000002601' and action = 'reviews.insert'
       and changes -> 'after' ? 'rating'),
  'audit_logs: older review rows lose the country, title and text and keep the rating'
);
select ok(
  (select name = 'Đã xoá' and email = 'deleted+00000000-0000-4000-8000-000000002601@invalid.local' and phone is null and message is null
     from public.inquiries where id = '26000000-0000-4000-8000-000000000001'),
  'inquiries without a booking: anonymised'
);
select is(
  (select name from public.inquiries where id = '26000000-0000-4000-8000-000000000002'), 'Nguyễn Văn An', 'inquiries with a kept booking: kept'
);
select is(
  (select array_agg(body order by body) from public.internal_notes
    where author_id = '00000000-0000-4000-8000-000000002603'
      and (inquiry_id in ('26000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000002')
           or customer_id = '00000000-0000-4000-8000-000000002601')),
  array['Note on the quoted inquiry'], 'internal_notes: the customer''s and the anonymised inquiry''s notes are deleted'
);
select is((select count(*)::int from public.subscribers where email = 'del-x@example.test'), 0, 'subscribers: the row is deleted');
select is(
  (select count(*)::int from public.consent_records
    where subject_email = 'del-x@example.test' and purpose = 'marketing' and not granted and document_version = 'account-deletion'),
  1, 'consent_records: the marketing withdrawal is recorded'
);
select is(
  (select count(*)::int from public.consent_records where subject_email = 'del-x@example.test' and purpose = 'privacy'),
  1, 'consent_records: earlier proof is kept'
);
select is(
  (select to_email from public.email_logs where template = 'booking_confirmed' and subject = 'S'),
  'deleted+00000000-0000-4000-8000-000000002601@invalid.local', 'email_logs: the address is replaced'
);
select is(
  (select array_agg(token_hash) from public.booking_access_tokens where booking_id = '51000000-0000-4000-8000-000000002601'),
  array[repeat('b', 64)], 'booking_access_tokens: unused tokens are deleted, used ones kept'
);
select ok(
  (select changes ? 'counts' and changes::text not like '%del-x%' from public.audit_logs
    where action = 'customers.anonymise' and entity_id = '00000000-0000-4000-8000-000000002601'),
  'audit_logs: customers.anonymise with counts and no address'
);
select is(
  (select sum(value::int)::int from jsonb_each_text(public.anonymise_customer('00000000-0000-4000-8000-000000002601'))),
  0, 'a second run changes nothing'
);
select is(
  (select count(*)::int from public.audit_logs where action = 'customers.anonymise' and entity_id = '00000000-0000-4000-8000-000000002601'),
  1, 'and writes no second audit row'
);

-- GoTrue's soft delete obfuscates the address; the profile keeps its placeholder.
update auth.users set email = 'obfuscated-abc@example.invalid', deleted_at = now() where id = '00000000-0000-4000-8000-000000002601';
select is(
  (select email from public.profiles where id = '00000000-0000-4000-8000-000000002601'),
  'deleted+00000000-0000-4000-8000-000000002601@invalid.local', 'the email-sync trigger leaves a deleted profile alone'
);
update auth.users set email = 'new-y@example.test' where id = '00000000-0000-4000-8000-000000002602';
select is((select email from public.profiles where id = '00000000-0000-4000-8000-000000002602'), 'new-y@example.test', 'and still syncs live profiles');
update auth.users set email = 'del-y@example.test' where id = '00000000-0000-4000-8000-000000002602';
select is(
  public.customer_deletion_state('00000000-0000-4000-8000-000000002601') - 'role',
  '{"requested": true, "auth_deleted": true, "profile_deleted": true}'::jsonb, 'the state after every step'
);

-- The admin wrapper -----------------------------------------------------------------------------------
select pg_temp.claims('00000000-0000-4000-8000-000000002603');
set local role authenticated;
select throws_ok($$ select public.admin_anonymise_customer('00000000-0000-4000-8000-000000002602', 'Khách yêu cầu') $$, '42501', null, 'sales cannot run a deletion');
reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000002604', 'aal1');
set local role authenticated;
select throws_ok($$ select public.admin_anonymise_customer('00000000-0000-4000-8000-000000002602', 'Khách yêu cầu') $$, '42501', null, 'an admin below aal2 cannot');
reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000002604', 'aal2');
set local role authenticated;
select throws_ok($$ select public.admin_anonymise_customer('00000000-0000-4000-8000-000000002602', 'ok') $$, 'P0001', 'note_required', 'a note is required');
select throws_ok($$ select public.admin_anonymise_customer('00000000-0000-4000-8000-000000002603', 'Khách yêu cầu') $$, 'P0002', null, 'only a requested customer deletion');
-- PR 5D: the wrapper refuses while a blocker remains (the balance, payment and trip ahead).
select throws_ok($$ select public.admin_anonymise_customer('00000000-0000-4000-8000-000000002602', 'Khách yêu cầu') $$, '55000', 'blocked', 'not while a blocker remains');
reset role;
-- The trips end and the open payment lapses: nothing blocks any more.
update public.bookings set status = 'completed', start_date = current_date - 5, amount_paid = total, needs_attention = false, attention_reason = null where id in ('51000000-0000-4000-8000-000000002603', '51000000-0000-4000-8000-000000002605');
update public.bookings set status = 'expired' where id = '51000000-0000-4000-8000-000000002604';
set local role authenticated;
select lives_ok($$ select public.admin_anonymise_customer('00000000-0000-4000-8000-000000002602', 'Chuyến đi đã kết thúc') $$, 'an MFA-verified admin finishes a waiting request');
reset role;
select ok(
  (select deleted_at is not null from public.profiles where id = '00000000-0000-4000-8000-000000002602')
    and (select count(*) = 0 from public.bookings where customer_id = '00000000-0000-4000-8000-000000002602'),
  'the customer is anonymised and their bookings unlinked'
);
select is(
  (select actor_id from public.audit_logs where action = 'customers.anonymise_by_admin' and entity_id = '00000000-0000-4000-8000-000000002602'),
  '00000000-0000-4000-8000-000000002604'::uuid, 'with the admin as actor'
);

-- Reviews are audited without the reviewer's words ------------------------------------------------------
insert into public.reviews (id, author_name, rating, content, locale) values
  ('52000000-0000-4000-8000-000000002602', 'Trần Thị Bình', 4, 'Rất đẹp', 'vi');
update public.reviews set status = 'approved' where id = '52000000-0000-4000-8000-000000002602';
select ok(
  (select bool_and(changes::text not like '%Bình%' and changes::text not like '%Rất đẹp%') from public.audit_logs
    where entity_id = '52000000-0000-4000-8000-000000002602'),
  'review audit rows name the text columns without copying them'
);
select ok(
  (select changes -> 'after' ->> 'status' = 'approved' from public.audit_logs
    where entity_id = '52000000-0000-4000-8000-000000002602' and action = 'reviews.update'),
  'and keep the moderation values'
);

-- #45 review: new → spam → contacted --------------------------------------------------------------------
select pg_temp.claims('00000000-0000-4000-8000-000000002603');
set local role authenticated;
select public.update_inquiry_status('26000000-0000-4000-8000-000000000003', 'spam');
select public.update_inquiry_status('26000000-0000-4000-8000-000000000003', 'contacted');
reset role;
select ok(
  (select status = 'contacted' and first_responded_at is not null from public.inquiries where id = '26000000-0000-4000-8000-000000000003'),
  'contacting an inquiry once marked spam is its first response'
);

select * from finish();
rollback;
