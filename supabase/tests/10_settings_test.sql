-- Settings rules (docs/specs/phase-2-catalog-admin.md step 21).
begin;
select plan(5);

create function pg_temp.claims(uid uuid, aal text default 'aal2')
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000905', 'admin-settings@example.test', '{}'),
  ('00000000-0000-4000-8000-000000000904', 'editor-settings@example.test', '{}');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000905';
update public.profiles set role = 'editor' where id = '00000000-0000-4000-8000-000000000904';

select pg_temp.claims('00000000-0000-4000-8000-000000000905');
set local role authenticated;
select throws_ok(
  $$ insert into public.settings (key, value, is_public) values ('bank_account', '{}', true) $$,
  '23514', null, 'the bank account can never be public'
);
select throws_ok(
  $$ insert into public.settings (key, value, is_public) values ('booking_rules', '{}', true)
     on conflict (key) do update set is_public = true $$,
  '23514', null, 'the booking rules can never be public'
);
select lives_ok(
  $$ insert into public.settings (key, value, is_public) values ('bank_account', '{"bank_name": "VCB"}', false)
     on conflict (key) do update set value = excluded.value, is_public = false $$,
  'an MFA-verified admin saves the bank account as a private setting'
);
reset role;

select pg_temp.claims('00000000-0000-4000-8000-000000000905', 'aal1');
set local role authenticated;
select throws_ok(
  $$ insert into public.settings (key, value, is_public) values ('homepage_test', '{}', true) $$,
  '42501', null, 'an admin below aal2 cannot write settings'
);
reset role;

select pg_temp.claims('00000000-0000-4000-8000-000000000904', 'aal1');
set local role authenticated;
select throws_ok(
  $$ insert into public.settings (key, value, is_public) values ('homepage_test', '{}', true) $$,
  '42501', null, 'editors cannot write settings'
);
reset role;

select * from finish();
rollback;
