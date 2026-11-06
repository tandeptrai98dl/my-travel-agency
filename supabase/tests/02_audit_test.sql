-- Audit trigger (docs/specs/phase-2-catalog-admin.md decision 2).
begin;
select plan(13);

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

-- Fixtures (as the table owner) -----------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000114', 'audit-editor@example.test'),
  ('00000000-0000-4000-8000-000000000115', 'audit-admin@example.test');
update public.profiles set role = 'editor' where id = '00000000-0000-4000-8000-000000000114';
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000115';

insert into public.tours (id, code, type, scope, duration_days, duration_nights, from_price) values
  ('10000000-0000-4000-8000-000000000101', 'T-AUDIT', 'group', 'domestic', 3, 2, 5000000);
insert into public.tour_translations (id, tour_id, locale, slug, title, summary) values
  ('11000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000101', 'vi',
   'tour-kiem-toan', 'Tour kiểm toán', 'Tóm tắt');
insert into public.destinations (id, key, type) values
  ('50000000-0000-4000-8000-000000000101', 'audit-destination', 'country');
insert into public.settings (key, value) values ('audit_test', '{"a": 1}');

select is(
  (select actor_id from public.audit_logs
   where entity_type = 'tours' and entity_id = '10000000-0000-4000-8000-000000000101'
     and action = 'tours.insert'),
  null,
  'changes without a session (seeding, service role) are logged with no actor'
);

-- Editor edits a title through the API ----------------------------------------------------------
select set_config(
  'request.headers',
  '{"x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "pgtap-agent"}',
  true
);
select pg_temp.claims('00000000-0000-4000-8000-000000000114');
set local role authenticated;

update public.tour_translations set title = 'Tour kiểm toán mới'
where id = '11000000-0000-4000-8000-000000000101';
-- Same value again: nothing changed, nothing logged.
update public.tour_translations set title = 'Tour kiểm toán mới'
where id = '11000000-0000-4000-8000-000000000101';
insert into public.tour_destinations (tour_id, destination_id) values
  ('10000000-0000-4000-8000-000000000101', '50000000-0000-4000-8000-000000000101');

select throws_ok(
  $$ insert into public.audit_logs (action, entity_type, entity_id)
     values ('fake', 'tours', '10000000-0000-4000-8000-000000000101') $$,
  '42501',
  null,
  'staff cannot write audit_logs directly'
);
select is(
  (select count(*)::int from public.audit_logs),
  0,
  'editors cannot read the audit log'
);

reset role;

select is(
  (select count(*)::int from public.audit_logs
   where action = 'tour_translations.update' and entity_id = '11000000-0000-4000-8000-000000000101'),
  1,
  'an update is logged once; an update that changes nothing is not logged'
);
select is(
  (select actor_id from public.audit_logs
   where action = 'tour_translations.update' and entity_id = '11000000-0000-4000-8000-000000000101'),
  '00000000-0000-4000-8000-000000000114'::uuid,
  'the actor is the signed-in staff member'
);
select is(
  (select changes from public.audit_logs
   where action = 'tour_translations.update' and entity_id = '11000000-0000-4000-8000-000000000101'),
  '{"before": {"title": "Tour kiểm toán"}, "after": {"title": "Tour kiểm toán mới"}}'::jsonb,
  'updates record only the changed columns, before and after'
);
select is(
  (select host(ip) || ' ' || user_agent from public.audit_logs
   where action = 'tour_translations.update' and entity_id = '11000000-0000-4000-8000-000000000101'),
  '203.0.113.7 pgtap-agent',
  'the client IP (first forwarded address) and user agent are recorded'
);
select is(
  (select entity_type || ':' || entity_id from public.audit_logs
   where action = 'tour_destinations.insert' and changes -> 'after' ->> 'destination_id' = '50000000-0000-4000-8000-000000000101'),
  'tour_destinations:10000000-0000-4000-8000-000000000101',
  'join-table changes are logged against their tour'
);

-- Admin (aal2) changes a setting and reads the log -----------------------------------------------
select pg_temp.claims('00000000-0000-4000-8000-000000000115', 'aal2');
set local role authenticated;
update public.settings set value = '{"a": 2}' where key = 'audit_test';
select ok(
  (select count(*) from public.audit_logs) > 0,
  'an MFA-verified admin reads the audit log'
);
reset role;

select is(
  (select entity_id from public.audit_logs where action = 'settings.update'
   and changes ->> 'key' = 'audit_test'),
  md5('audit_test')::uuid,
  'settings are keyed by md5(key) and keep the key in changes'
);
select is(
  (select changes -> 'after' from public.audit_logs where action = 'settings.update'
   and changes ->> 'key' = 'audit_test'),
  '{"value": {"a": 2}}'::jsonb,
  'settings changes keep before and after values'
);

-- Admin below aal2 cannot read it --------------------------------------------------------------
select pg_temp.claims('00000000-0000-4000-8000-000000000115', 'aal1');
set local role authenticated;
select is((select count(*)::int from public.audit_logs), 0, 'admin without MFA cannot read the audit log');
reset role;

select is(
  (select count(*)::int from pg_trigger t join pg_class c on c.oid = t.tgrelid
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and t.tgname = 'audit_row_change'),
  23,
  'catalog, content, settings and profile tables carry the audit trigger'
);

select * from finish();
rollback;
