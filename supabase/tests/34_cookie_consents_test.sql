-- Cookie-consent records (Phase 6 PR 6P, ADR-039): RLS on with no API-role policy or privilege,
-- writes only through the service-role function, shape and action checks, the 5-year purge.
begin;
select plan(16);

-- Locked down -----------------------------------------------------------------------------------
select ok(
  (select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'cookie_consents'),
  'RLS is enabled on cookie_consents'
);
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'cookie_consents'),
  0,
  'no policy opens cookie_consents to an API role'
);
select ok(
  not has_table_privilege('anon', 'public.cookie_consents', 'select')
    and not has_table_privilege('authenticated', 'public.cookie_consents', 'select')
    and not has_table_privilege('anon', 'public.cookie_consents', 'insert')
    and not has_table_privilege('authenticated', 'public.cookie_consents', 'insert')
    and not has_table_privilege('anon', 'public.cookie_consents', 'update')
    and not has_table_privilege('authenticated', 'public.cookie_consents', 'update')
    and not has_table_privilege('anon', 'public.cookie_consents', 'delete')
    and not has_table_privilege('authenticated', 'public.cookie_consents', 'delete'),
  'API roles hold no privilege on cookie_consents (no select, insert, update or delete)'
);
select ok(
  not has_function_privilege('anon', 'public.record_cookie_consent(uuid, text, boolean, boolean, text, public.locale)', 'execute')
    and not has_function_privilege('authenticated', 'public.record_cookie_consent(uuid, text, boolean, boolean, text, public.locale)', 'execute')
    and has_function_privilege('service_role', 'public.record_cookie_consent(uuid, text, boolean, boolean, text, public.locale)', 'execute'),
  'only the service role records a choice'
);
select ok(
  not has_function_privilege('anon', 'public.purge_cookie_consents()', 'execute')
    and not has_function_privilege('authenticated', 'public.purge_cookie_consents()', 'execute'),
  'API roles cannot run the purge'
);
select ok(
  (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.record_cookie_consent(uuid, text, boolean, boolean, text, public.locale)'::regprocedure),
  'the insert function is security definer with an empty search_path'
);

-- Writes ----------------------------------------------------------------------------------------
select lives_ok(
  $$select public.record_cookie_consent('11111111-1111-4111-8111-111111111111', 'accept_all', true, true, 'banner-vi-0123456789abcdef', 'vi')$$,
  'a choice is recorded'
);
select is(
  (select action || '|' || choices::text || '|' || banner_version || '|' || locale
     from public.cookie_consents where id = '11111111-1111-4111-8111-111111111111'),
  'accept_all|{"analytics": true, "marketing": true}|banner-vi-0123456789abcdef|vi',
  'the row holds the action, the choices, the banner version and the language only'
);
select lives_ok(
  $$select public.record_cookie_consent('11111111-1111-4111-8111-111111111111', 'withdraw', false, false, 'banner-vi-0123456789abcdef', 'vi')$$,
  'a changed choice is recorded too'
);
select is(
  (select array_agg(action order by record_id) from public.cookie_consents where id = '11111111-1111-4111-8111-111111111111'),
  array['accept_all', 'withdraw'],
  'a changed choice is a new row with the same id'
);
select throws_ok(
  $$select public.record_cookie_consent(gen_random_uuid(), 'maybe', true, false, 'banner-en-0123456789abcdef', 'en')$$,
  '23514', null, 'an unknown action is refused'
);
select throws_ok(
  $$select public.record_cookie_consent(gen_random_uuid(), 'accept_all', true, false, 'banner-en-0123456789abcdef', 'en')$$,
  '23514', null, 'an action that disagrees with the choices is refused'
);
select throws_ok(
  $$select public.record_cookie_consent(gen_random_uuid(), 'custom', true, false, 'v1', 'en')$$,
  '23514', null, 'a banner version that is not a banner hash is refused'
);

-- An API role reading or writing the table directly is refused.
set local role anon;
select throws_ok($$select count(*) from public.cookie_consents$$, '42501', null, 'anon cannot read the table');
reset role;

-- Purge -----------------------------------------------------------------------------------------
insert into public.cookie_consents (id, action, choices, banner_version, locale, created_at)
values
  ('22222222-2222-4222-8222-222222222222', 'custom', '{"analytics": true, "marketing": false}', 'banner-en-0123456789abcdef', 'en', now() - interval '5 years 1 day'),
  ('33333333-3333-4333-8333-333333333333', 'custom', '{"analytics": true, "marketing": false}', 'banner-en-0123456789abcdef', 'en', now() - interval '4 years 11 months');
select is(public.purge_cookie_consents(), 1, 'the purge removes one row older than five years');
select is(
  (select array_agg(id::text order by id) from public.cookie_consents
    where id in ('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333')),
  array['33333333-3333-4333-8333-333333333333'],
  'younger rows stay'
);

select * from finish();
rollback;
