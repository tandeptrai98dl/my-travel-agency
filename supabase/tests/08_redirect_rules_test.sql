-- Redirect rules (docs/specs/phase-2-catalog-admin.md step 20).
begin;
select plan(9);

create function pg_temp.claims(uid uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000814', 'editor-r8@example.test', '{}'),
  ('00000000-0000-4000-8000-000000000812', 'operator-r8@example.test', '{}');
update public.profiles set role = 'editor' where id = '00000000-0000-4000-8000-000000000814';
update public.profiles set role = 'operator' where id = '00000000-0000-4000-8000-000000000812';

select pg_temp.claims('00000000-0000-4000-8000-000000000814');
set local role authenticated;
select lives_ok(
  $$ insert into public.redirects (from_path, to_path) values ('/khuyen-mai-he', '/tours') $$,
  'an editor adds a redirect'
);
select throws_ok(
  $$ insert into public.redirects (from_path, to_path) values ('/old', 'https://evil.example') $$,
  '23514', null, 'targets stay on the site'
);
select throws_ok(
  $$ insert into public.redirects (from_path, to_path) values ('//evil.example', '/tours') $$,
  '23514', null, 'a protocol-relative source is refused'
);
select throws_ok(
  $$ insert into public.redirects (from_path, to_path) values ('/tours', '/tours') $$,
  '23514', null, 'a path cannot redirect to itself'
);
select throws_ok(
  $$ insert into public.redirects (from_path, to_path, status_code) values ('/a', '/b', 200) $$,
  '23514', null, 'only redirect status codes'
);
select throws_ok(
  $$ insert into public.redirects (from_path, to_path) values ('/xuan-2025', '/khuyen-mai-he') $$,
  '23514', 'the target is itself redirected', 'a redirect to a redirected path is refused'
);
select throws_ok(
  $$ insert into public.redirects (from_path, to_path) values ('/tours', '/diem-den') $$,
  '23514', 'other redirects point to this path', 'a path other redirects point to cannot be redirected'
);
reset role;

select pg_temp.claims('00000000-0000-4000-8000-000000000812');
set local role authenticated;
select is((select count(*)::int from public.redirects), 0, 'operators do not see redirects');
select throws_ok(
  $$ insert into public.redirects (from_path, to_path) values ('/x', '/y') $$,
  '42501', null, 'operators cannot add redirects'
);
reset role;

select * from finish();
rollback;
