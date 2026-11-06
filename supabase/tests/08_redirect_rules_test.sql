-- Redirect rules (docs/specs/phase-2-catalog-admin.md step 20).
begin;
select plan(16);

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

-- Functions (PR 17 review): one transaction each ------------------------------------------------------
select pg_temp.claims('00000000-0000-4000-8000-000000000814');
set local role authenticated;
insert into public.redirects (from_path, to_path) values ('/le-hoi-cu', '/le-hoi');
select lives_ok(
  $$ select public.create_redirect('/le-hoi', '/tours/le-hoi-2027', 301) $$,
  'an editor adds a redirect from a path others point to'
);
select is(
  (select to_path from public.redirects where from_path = '/le-hoi-cu'),
  '/tours/le-hoi-2027',
  'redirects that pointed at the new source now go straight to its target'
);
select throws_ok(
  $$ select public.create_redirect('/le-hoi', '/tours') $$,
  '23505', 'this path already has a redirect', 'a source has one redirect'
);
select throws_ok(
  $$ select public.create_redirect('/khac', '/le-hoi') $$,
  '23514', 'the target is itself redirected', 'a target that is itself redirected is refused'
);
select lives_ok(
  $$ select public.record_slug_redirect('/tours/a', '/tours/b');
     select public.record_slug_redirect('/tours/b', '/tours/c');
     select public.record_slug_redirect('/tours/c', '/tours/a') $$,
  'slug changes back and forth keep the table flat'
);
select is(
  (select string_agg(from_path || '>' || to_path, ' ' order by from_path) from public.redirects where from_path like '/tours/%'),
  '/tours/b>/tours/a /tours/c>/tours/a',
  'after A→B→C→A, B and C point to A and A is not redirected'
);
reset role;
select ok(
  not has_function_privilege('anon', 'public.create_redirect(text, text, integer)', 'execute'),
  'anon cannot call the redirect functions'
);

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
