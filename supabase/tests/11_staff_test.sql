-- Staff rules (docs/specs/phase-2-catalog-admin.md step 22).
begin;
select plan(8);

create function pg_temp.claims(uid uuid, aal text default 'aal2')
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000915', 'admin-a@example.test', '{}'),
  ('00000000-0000-4000-8000-000000000916', 'admin-b@example.test', '{}'),
  ('00000000-0000-4000-8000-000000000914', 'editor-s@example.test', '{}');
update public.profiles set role = 'admin'
 where id in ('00000000-0000-4000-8000-000000000915', '00000000-0000-4000-8000-000000000916');
update public.profiles set role = 'editor' where id = '00000000-0000-4000-8000-000000000914';
-- Only A and B are active admins for this test (CI may have seeded another).
update public.profiles set is_active = false
 where role = 'admin' and id not in ('00000000-0000-4000-8000-000000000915', '00000000-0000-4000-8000-000000000916');

-- Admin A at aal2 -----------------------------------------------------------------------------------
select pg_temp.claims('00000000-0000-4000-8000-000000000915');
set local role authenticated;
select throws_ok(
  $$ update public.profiles set role = 'editor' where id = '00000000-0000-4000-8000-000000000915' $$,
  '42501', 'an admin cannot remove their own admin access', 'an admin cannot demote themself'
);
select throws_ok(
  $$ update public.profiles set is_active = false where id = '00000000-0000-4000-8000-000000000915' $$,
  '42501', null, 'an admin cannot deactivate themself'
);
select lives_ok(
  $$ update public.profiles set full_name = 'Quản trị A' where id = '00000000-0000-4000-8000-000000000915' $$,
  'an admin still edits their own name'
);
select lives_ok(
  $$ update public.profiles set role = 'sales' where id = '00000000-0000-4000-8000-000000000916' $$,
  'an admin demotes another admin while one remains'
);
select lives_ok(
  $$ update public.profiles set role = 'operator', is_active = false where id = '00000000-0000-4000-8000-000000000914' $$,
  'an admin changes and deactivates a staff account'
);
reset role;

-- The last active admin, whoever asks ------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ update public.profiles set is_active = false where id = '00000000-0000-4000-8000-000000000915' $$,
  '23514', 'the last active admin keeps the role', 'even the owner cannot deactivate the last active admin'
);
select throws_ok(
  $$ delete from auth.users where id = '00000000-0000-4000-8000-000000000915' $$,
  '23514', null, 'the last active admin cannot be deleted'
);
select lives_ok(
  $$ update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000916' $$,
  'promoting another admin is always allowed'
);

select * from finish();
rollback;
