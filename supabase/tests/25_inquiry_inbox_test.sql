-- Inquiry inbox (*_inquiry_inbox.sql, Phase 5 PR 5C, spec decision 9, ADR-037): who reads which
-- inquiries, no direct writes of status, owner or first response, and what each function allows.
begin;
select plan(59);

create function pg_temp.as_user(uid uuid, aal text default 'aal1')
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000002501', 'inq-sales-a@example.test', '{}'),
  ('00000000-0000-4000-8000-000000002502', 'inq-sales-b@example.test', '{}'),
  ('00000000-0000-4000-8000-000000002503', 'inq-manager@example.test', '{}'),
  ('00000000-0000-4000-8000-000000002504', 'inq-operator@example.test', '{}'),
  ('00000000-0000-4000-8000-000000002505', 'inq-accountant@example.test', '{}'),
  ('00000000-0000-4000-8000-000000002506', 'inq-editor@example.test', '{}'),
  ('00000000-0000-4000-8000-000000002507', 'inq-admin@example.test', '{}'),
  ('00000000-0000-4000-8000-000000002508', 'inq-customer@example.test', '{}');
update public.profiles set role = 'sales' where id in ('00000000-0000-4000-8000-000000002501', '00000000-0000-4000-8000-000000002502');
update public.profiles set role = 'sales_manager' where id = '00000000-0000-4000-8000-000000002503';
update public.profiles set role = 'operator' where id = '00000000-0000-4000-8000-000000002504';
update public.profiles set role = 'accountant' where id = '00000000-0000-4000-8000-000000002505';
update public.profiles set role = 'editor' where id = '00000000-0000-4000-8000-000000002506';
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000002507';

-- U: unassigned; B: assigned to seller B; N: a fresh one for the spam rule; Q: for the quote.
insert into public.inquiries (id, code, name, email, locale, source, adults, assigned_to) values
  ('25000000-0000-4000-8000-000000000001', 'INQ-T25-0001', 'Lan', 'lan25@example.test', 'vi', 'tailor_made', 2, null),
  ('25000000-0000-4000-8000-000000000002', 'INQ-T25-0002', 'Minh', 'minh25@example.test', 'en', 'contact', null, '00000000-0000-4000-8000-000000002502'),
  ('25000000-0000-4000-8000-000000000003', 'INQ-T25-0003', 'Spam', 'spam25@example.test', 'en', 'contact', null, null),
  ('25000000-0000-4000-8000-000000000004', 'INQ-T25-0004', 'Anna', 'anna25@example.test', 'en', 'tour_inquiry', 2, null);
insert into public.consent_records (subject_email, purpose, granted, document_version, inquiry_id) values
  ('lan25@example.test', 'privacy', true, 'privacy-vi-0123456789abcdef', '25000000-0000-4000-8000-000000000001');

-- Privileges --------------------------------------------------------------------------------------
select ok(
  not has_any_column_privilege('authenticated', 'public.inquiries', 'update'),
  'authenticated has no UPDATE privilege on any inquiry column'
);
select ok(
  not has_column_privilege('authenticated', 'public.inquiries', 'status', 'insert')
    and not has_column_privilege('authenticated', 'public.inquiries', 'assigned_to', 'insert')
    and not has_column_privilege('authenticated', 'public.inquiries', 'first_responded_at', 'insert'),
  'staff inserts cannot set status, owner or first response'
);
select ok(
  not has_function_privilege('anon', 'public.assign_inquiry(uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.update_inquiry_status(uuid, public.inquiry_status, text)', 'execute')
    and not has_function_privilege('anon', 'public.add_inquiry_note(uuid, text, boolean)', 'execute'),
  'anon cannot call the inquiry functions'
);
select ok(
  not has_function_privilege('authenticated', 'public.lock_workable_inquiry(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.log_inquiry_change(uuid, text, jsonb)', 'execute'),
  'the internal helpers are not callable through the API'
);

-- Direct updates fail for sales, sales_manager and admin ------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-000000002501');
set local role authenticated;
select throws_ok($$ update public.inquiries set status = 'won' where id = '25000000-0000-4000-8000-000000000001' $$, '42501', null, 'sales cannot update status directly');
select throws_ok($$ update public.inquiries set assigned_to = auth.uid() where id = '25000000-0000-4000-8000-000000000001' $$, '42501', null, 'sales cannot update the owner directly');
select throws_ok($$ update public.inquiries set first_responded_at = now() where id = '25000000-0000-4000-8000-000000000001' $$, '42501', null, 'sales cannot update the first response directly');
select is((select count(*)::int from public.inquiries where code like 'INQ-T25-%'), 3, 'sales read unassigned inquiries, not another seller''s');
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-000000002503');
set local role authenticated;
select throws_ok($$ update public.inquiries set status = 'won' where id = '25000000-0000-4000-8000-000000000002' $$, '42501', null, 'a sales manager cannot update status directly');
select throws_ok($$ update public.inquiries set assigned_to = auth.uid() where id = '25000000-0000-4000-8000-000000000002' $$, '42501', null, 'a sales manager cannot update the owner directly');
select throws_ok($$ update public.inquiries set first_responded_at = now() where id = '25000000-0000-4000-8000-000000000002' $$, '42501', null, 'a sales manager cannot update the first response directly');
select is((select count(*)::int from public.inquiries where code like 'INQ-T25-%'), 4, 'a sales manager reads every inquiry (ADR-037)');
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-000000002507', 'aal2');
set local role authenticated;
select throws_ok($$ update public.inquiries set status = 'won' where id = '25000000-0000-4000-8000-000000000002' $$, '42501', null, 'an admin cannot update status directly');
select throws_ok($$ update public.inquiries set assigned_to = null where id = '25000000-0000-4000-8000-000000000002' $$, '42501', null, 'an admin cannot update the owner directly');
select throws_ok($$ update public.inquiries set first_responded_at = now() where id = '25000000-0000-4000-8000-000000000002' $$, '42501', null, 'an admin cannot update the first response directly');
select throws_ok(
  $$ insert into public.inquiries (code, name, email, locale, status) values ('INQ-T25-X', 'X', 'x25@example.test', 'vi', 'won') $$,
  '42501', null, 'an admin cannot insert an inquiry with a status'
);
reset role;

-- Reads per role ----------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-000000002504');
set local role authenticated;
select is((select count(*)::int from public.inquiries where code like 'INQ-T25-%'), 4, 'operators read every inquiry');
select throws_ok($$ select public.add_inquiry_note('25000000-0000-4000-8000-000000000001', 'Called her', true) $$, '42501', null, 'operators cannot add notes');
select throws_ok($$ select public.update_inquiry_status('25000000-0000-4000-8000-000000000001', 'contacted') $$, '42501', null, 'operators cannot change the status');
select throws_ok($$ select public.assign_inquiry('25000000-0000-4000-8000-000000000001', auth.uid()) $$, '42501', null, 'operators cannot take inquiries');
select is((select count(*)::int from public.inquiry_consents('25000000-0000-4000-8000-000000000001')), 1, 'operators see the consent version');
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-000000002505', 'aal2');
set local role authenticated;
select is((select count(*)::int from public.inquiries where code like 'INQ-T25-%'), 0, 'accountants read no inquiries');
select throws_ok($$ select public.update_inquiry_status('25000000-0000-4000-8000-000000000001', 'contacted') $$, '42501', null, 'accountants cannot change the status');
select is((select count(*)::int from public.inquiry_consents('25000000-0000-4000-8000-000000000001')), 0, 'accountants see no consent rows');
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-000000002506');
set local role authenticated;
select is((select count(*)::int from public.inquiries where code like 'INQ-T25-%'), 0, 'editors read no inquiries');
select throws_ok($$ select public.assign_inquiry('25000000-0000-4000-8000-000000000001', null) $$, '42501', null, 'editors cannot assign');
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-000000002508');
set local role authenticated;
select is((select count(*)::int from public.inquiry_activity('25000000-0000-4000-8000-000000000001')), 0, 'a customer sees no inquiry history');
reset role;

-- Assignment --------------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-000000002501');
set local role authenticated;
select throws_ok(
  $$ select public.assign_inquiry('25000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000002502') $$,
  '42501', null, 'sales cannot assign an inquiry to someone else'
);
select throws_ok(
  $$ select public.assign_inquiry('25000000-0000-4000-8000-000000000002', auth.uid()) $$,
  'P0002', null, 'sales cannot take another seller''s inquiry (it looks like a missing one)'
);
select lives_ok($$ select public.assign_inquiry('25000000-0000-4000-8000-000000000001', auth.uid()) $$, 'sales take an unassigned inquiry');
select throws_ok($$ select public.assign_inquiry('25000000-0000-4000-8000-000000000001', null) $$, '42501', null, 'sales cannot release an inquiry');
reset role;
select is(
  (select assigned_to from public.inquiries where id = '25000000-0000-4000-8000-000000000001'),
  '00000000-0000-4000-8000-000000002501'::uuid, 'the inquiry is the seller''s'
);
select is(
  (select changes from public.audit_logs where entity_id = '25000000-0000-4000-8000-000000000001' and action = 'inquiries.assign'),
  '{"after": {"assigned_to": "00000000-0000-4000-8000-000000002501"}, "before": {"assigned_to": null}}'::jsonb,
  'taking it is audit-logged with the owner before and after'
);

select pg_temp.as_user('00000000-0000-4000-8000-000000002503');
set local role authenticated;
select lives_ok(
  $$ select public.assign_inquiry('25000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000002501') $$,
  'a sales manager assigns another seller''s inquiry'
);
select throws_ok(
  $$ select public.assign_inquiry('25000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000002504') $$,
  '22023', null, 'an operator cannot be an inquiry''s owner'
);
select throws_ok(
  $$ select public.assign_inquiry('25000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000002508') $$,
  '22023', null, 'a customer cannot be an inquiry''s owner'
);
reset role;
select is(
  (select assigned_to from public.inquiries where id = '25000000-0000-4000-8000-000000000002'),
  '00000000-0000-4000-8000-000000002501'::uuid, 'the manager''s assignment is saved'
);

select pg_temp.as_user('00000000-0000-4000-8000-000000002507', 'aal1');
set local role authenticated;
select throws_ok($$ select public.assign_inquiry('25000000-0000-4000-8000-000000000002', null) $$, '42501', null, 'an admin below aal2 cannot assign');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-000000002507', 'aal2');
set local role authenticated;
select lives_ok($$ select public.assign_inquiry('25000000-0000-4000-8000-000000000002', null) $$, 'an MFA-verified admin assigns nobody');
reset role;
select is((select assigned_to from public.inquiries where id = '25000000-0000-4000-8000-000000000002'), null, 'the inquiry is unassigned again');

-- Status and the first response -------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-000000002501');
set local role authenticated;
select throws_ok($$ select public.update_inquiry_status('25000000-0000-4000-8000-000000000001', 'new') $$, '22023', null, 'nothing goes back to new');
select lives_ok(
  $$ select public.update_inquiry_status('25000000-0000-4000-8000-000000000001', 'contacted', 'Called, wants May') $$,
  'sales change the status of their inquiry, with a note'
);
reset role;
select ok(
  (select status = 'contacted' and first_responded_at is not null from public.inquiries where id = '25000000-0000-4000-8000-000000000001'),
  'the first change away from new is the first response'
);
select is(
  (select count(*)::int from public.internal_notes where inquiry_id = '25000000-0000-4000-8000-000000000001' and body = 'Called, wants May'),
  1, 'the status note is kept as an internal note'
);
update public.inquiries set first_responded_at = '2026-01-01T00:00:00Z' where id = '25000000-0000-4000-8000-000000000001';
select pg_temp.as_user('00000000-0000-4000-8000-000000002501');
set local role authenticated;
select lives_ok($$ select public.update_inquiry_status('25000000-0000-4000-8000-000000000001', 'lost') $$, 'a later change');
select lives_ok($$ select public.add_inquiry_note('25000000-0000-4000-8000-000000000001', 'Emailed again', true) $$, 'a later contact note');
reset role;
select is(
  (select first_responded_at from public.inquiries where id = '25000000-0000-4000-8000-000000000001'),
  '2026-01-01T00:00:00Z'::timestamptz, 'the first response is set once'
);

select pg_temp.as_user('00000000-0000-4000-8000-000000002502');
set local role authenticated;
select lives_ok($$ select public.update_inquiry_status('25000000-0000-4000-8000-000000000003', 'spam') $$, 'another seller marks an unassigned message as spam');
reset role;
select ok(
  (select status = 'spam' and first_responded_at is null from public.inquiries where id = '25000000-0000-4000-8000-000000000003'),
  'marking spam is not a first response'
);

-- Notes ---------------------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-000000002502');
set local role authenticated;
select throws_ok($$ select public.add_inquiry_note('25000000-0000-4000-8000-000000000004', 'ok', false) $$, 'P0001', 'note_required', 'a note has at least 3 characters');
select throws_ok($$ select public.add_inquiry_note('25000000-0000-4000-8000-000000000001', 'Not mine', false) $$, 'P0002', null, 'sales cannot note another seller''s inquiry');
select lives_ok($$ select public.add_inquiry_note('25000000-0000-4000-8000-000000000004', 'Looked at dates', false) $$, 'a plain note');
reset role;
select ok(
  (select status = 'new' and first_responded_at is null from public.inquiries where id = '25000000-0000-4000-8000-000000000004'),
  'a note without contact is not a first response'
);
select pg_temp.as_user('00000000-0000-4000-8000-000000002502');
set local role authenticated;
select lives_ok($$ select public.add_inquiry_note('25000000-0000-4000-8000-000000000004', 'Phoned Anna', true) $$, 'a contact note');
select is((select count(*)::int from public.inquiry_activity('25000000-0000-4000-8000-000000000004')), 2, 'sales read the history of an inquiry they can work');
reset role;
select ok(
  (select status = 'contacted' and first_responded_at is not null from public.inquiries where id = '25000000-0000-4000-8000-000000000004'),
  'a contact note sets the first response and moves new to contacted'
);

-- Quotes ----------------------------------------------------------------------------------------------
update public.inquiries set status = 'new', first_responded_at = null where id = '25000000-0000-4000-8000-000000000004';
update public.inquiries set assigned_to = '00000000-0000-4000-8000-000000002501' where id = '25000000-0000-4000-8000-000000000003';
create function pg_temp.quote(inquiry uuid)
returns uuid
language sql
as $$
  select public.create_quote(jsonb_build_object(
    'tour_id', (select id from public.tours where code = 'VN-HER-05'), 'start_date', public.vietnam_today() + 90, 'locale', 'en',
    'adults', 2, 'price_adult', 20000000, 'payment_plan', 'full', 'valid_days', 5,
    'contact_name', 'Anna Berg', 'contact_email', 'anna25@example.test', 'contact_phone', '+46 70 000 00 00', 'inquiry_id', inquiry))
$$;
select pg_temp.as_user('00000000-0000-4000-8000-000000002502');
set local role authenticated;
select throws_ok($$ select pg_temp.quote('25000000-0000-4000-8000-000000000003') $$, 'P0002', null, 'sales cannot quote another seller''s inquiry');
select lives_ok($$ select pg_temp.quote('25000000-0000-4000-8000-000000000004') $$, 'sales quote an unassigned inquiry');
reset role;
select ok(
  (select status = 'quoted' and first_responded_at is not null and assigned_to = '00000000-0000-4000-8000-000000002502'
     from public.inquiries where id = '25000000-0000-4000-8000-000000000004'),
  'a quote is a first response and gives the inquiry to the seller who quoted it'
);

select * from finish();
rollback;
