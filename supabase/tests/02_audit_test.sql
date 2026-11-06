-- Audit trigger (docs/specs/phase-2-catalog-admin.md decision 2).
begin;
select plan(18);

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
  ('00000000-0000-4000-8000-000000000115', 'audit-admin@example.test'),
  ('00000000-0000-4000-8000-000000000116', 'audit-customer@example.test');
update public.profiles set role = 'editor' where id = '00000000-0000-4000-8000-000000000114';
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000115';

insert into public.tours (id, code, type, scope, duration_days, duration_nights, from_price) values
  ('10000000-0000-4000-8000-000000000101', 'T-AUDIT', 'group', 'domestic', 3, 2, 5000000);
insert into public.tour_translations (id, tour_id, locale, slug, title, summary) values
  ('11000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000101', 'vi',
   'tour-kiem-toan', 'Tour kiểm toán', 'Tóm tắt');
insert into public.destinations (id, key, type) values
  ('50000000-0000-4000-8000-000000000101', 'audit-destination', 'country'),
  ('50000000-0000-4000-8000-000000000102', 'audit-destination-2', 'country');
insert into public.departures (id, tour_id, start_date, end_date, capacity, price_adult) values
  ('20000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000101',
   current_date + 30, current_date + 32, 20, 5000000);
insert into public.settings (key, value) values ('audit_test', '{"a": 1}');

select is(
  (select count(*)::int from public.audit_logs
   where action = 'tours.insert' and entity_id = '10000000-0000-4000-8000-000000000101'
     and actor_id is null and changes -> 'after' ->> 'code' = 'T-AUDIT'),
  1,
  'an insert without a session (seeding, service role) is logged once, with no actor and the new row'
);

-- Editor edits through the API --------------------------------------------------------------------
select pg_temp.claims('00000000-0000-4000-8000-000000000114');
set local role authenticated;

update public.tour_translations set title = 'Tour kiểm toán mới'
where id = '11000000-0000-4000-8000-000000000101';
-- Same value again: nothing changed, nothing logged.
update public.tour_translations set title = 'Tour kiểm toán mới'
where id = '11000000-0000-4000-8000-000000000101';
insert into public.tour_destinations (tour_id, destination_id) values
  ('10000000-0000-4000-8000-000000000101', '50000000-0000-4000-8000-000000000101');
delete from public.destinations where id = '50000000-0000-4000-8000-000000000102';

select throws_ok(
  $$ insert into public.audit_logs (action, entity_type, entity_id)
     values ('fake', 'tours', '10000000-0000-4000-8000-000000000101') $$,
  '42501',
  null,
  'staff cannot write audit_logs directly'
);
select is((select count(*)::int from public.audit_logs), 0, 'editors cannot read the audit log');

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
  (select ip is null and user_agent is null from public.audit_logs
   where action = 'tour_translations.update' and entity_id = '11000000-0000-4000-8000-000000000101'),
  true,
  'no IP or user agent is recorded (they would be the server''s own or forgeable)'
);
select is(
  (select count(*)::int from public.audit_logs
   where action = 'tour_destinations.insert' and entity_id = '10000000-0000-4000-8000-000000000101'
     and changes -> 'after' ->> 'destination_id' = '50000000-0000-4000-8000-000000000101'),
  1,
  'join-table changes are logged against their tour'
);
select is(
  (select changes -> 'before' ->> 'key' from public.audit_logs
   where action = 'destinations.delete' and entity_id = '50000000-0000-4000-8000-000000000102'),
  'audit-destination-2',
  'a delete keeps the removed row under "before"'
);

-- Seats and timestamps alone are not logged ---------------------------------------------------------
update public.departures set seats_reserved = 2 where id = '20000000-0000-4000-8000-000000000101';
update public.departures set capacity = 24 where id = '20000000-0000-4000-8000-000000000101';
select is(
  (select array_agg(changes -> 'after' order by created_at) from public.audit_logs
   where action = 'departures.update' and entity_id = '20000000-0000-4000-8000-000000000101'),
  array['{"capacity": 24}'::jsonb],
  'seat movements are not logged; a capacity change is'
);

-- Personal data never reaches the log ---------------------------------------------------------------
select pg_temp.claims('00000000-0000-4000-8000-000000000116');
set local role authenticated;
update public.profiles set full_name = 'Nguyễn Văn Riêng', phone = '+84900000116'
where id = '00000000-0000-4000-8000-000000000116';
reset role;
-- Anonymised by the system (service role): no session.
select set_config('request.jwt.claims', '', true);
update public.profiles set full_name = null, phone = null, deleted_at = now()
where id = '00000000-0000-4000-8000-000000000116';
select is(
  (select count(*)::int from public.audit_logs
   where entity_type = 'profiles' and entity_id = '00000000-0000-4000-8000-000000000116'
     and (changes::text like '%Riêng%' or changes::text like '%+84900000116%')),
  0,
  'profile edits and anonymisation never copy personal data into the log'
);
select is(
  (select changes -> 'changed' from public.audit_logs
   where action = 'profiles.update' and entity_id = '00000000-0000-4000-8000-000000000116'
     and actor_id = '00000000-0000-4000-8000-000000000116'),
  '["full_name", "phone"]'::jsonb,
  'personal-data changes are listed by column name only'
);
select ok(
  (select changes -> 'after' ? 'deleted_at' from public.audit_logs
   where action = 'profiles.update' and entity_id = '00000000-0000-4000-8000-000000000116'
     and actor_id is null),
  'status columns (deleted_at) keep their values'
);

-- Admin (aal2) changes a setting and reads the log ---------------------------------------------------
select pg_temp.claims('00000000-0000-4000-8000-000000000115', 'aal2');
set local role authenticated;
update public.settings set value = '{"a": 2}' where key = 'audit_test';
select ok((select count(*) from public.audit_logs) > 0, 'an MFA-verified admin reads the audit log');
reset role;

select is(
  (select entity_id from public.audit_logs where action = 'settings.update'
   and changes ->> 'key' = 'audit_test'),
  md5('audit_test')::uuid,
  'settings are keyed by md5(key) and keep the key in changes'
);

-- Admin below aal2 cannot read it ------------------------------------------------------------------
select pg_temp.claims('00000000-0000-4000-8000-000000000115', 'aal1');
set local role authenticated;
select is((select count(*)::int from public.audit_logs), 0, 'admin without MFA cannot read the audit log');
reset role;

-- Deleting a user keeps their entries without the link ------------------------------------------------
delete from auth.users where id = '00000000-0000-4000-8000-000000000114';
select is(
  (select count(*)::int from public.audit_logs
   where action = 'tour_translations.update' and entity_id = '11000000-0000-4000-8000-000000000101'
     and actor_id is null),
  1,
  'deleting a user is not blocked; their entries stay with no actor'
);

select is(
  (select count(*)::int from pg_trigger t join pg_class c on c.oid = t.tgrelid
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and t.tgname = 'audit_row_change'),
  23,
  'catalog, content, settings and profile tables carry the audit trigger'
);

select * from finish();
rollback;
