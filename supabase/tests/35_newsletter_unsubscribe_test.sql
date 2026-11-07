-- Newsletter withdrawal (Phase 6 PR 6P step 10a): hashed single-use tokens issued by the export for
-- active subscribers only, and an unsubscribe that records the withdrawal in the same transaction.
begin;
select plan(17);

-- Locked down -----------------------------------------------------------------------------------
select ok(
  (select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'newsletter_unsubscribe_tokens')
    and (select count(*) = 0 from pg_policies where schemaname = 'public' and tablename = 'newsletter_unsubscribe_tokens'),
  'RLS is on with no API-role policy'
);
select ok(
  not has_table_privilege('anon', 'public.newsletter_unsubscribe_tokens', 'select')
    and not has_table_privilege('authenticated', 'public.newsletter_unsubscribe_tokens', 'select'),
  'API roles cannot read token hashes'
);
select ok(
  not has_function_privilege('anon', 'public.unsubscribe_newsletter(text)', 'execute')
    and not has_function_privilege('authenticated', 'public.unsubscribe_newsletter(text)', 'execute')
    and not has_function_privilege('anon', 'public.issue_newsletter_unsubscribe_tokens(uuid[], text[])', 'execute')
    and not has_function_privilege('authenticated', 'public.issue_newsletter_unsubscribe_tokens(uuid[], text[])', 'execute'),
  'API roles cannot issue tokens or unsubscribe directly'
);
select ok(
  has_function_privilege('service_role', 'public.unsubscribe_newsletter(text)', 'execute')
    and has_function_privilege('service_role', 'public.issue_newsletter_unsubscribe_tokens(uuid[], text[])', 'execute'),
  'the service role can call both'
);

-- Fixtures: an active, a pending and an unsubscribed subscriber.
insert into public.subscribers (id, email, locale, confirmed_at, unsubscribed_at) values
  ('a0000000-0000-4000-8000-000000000001', 'active@example.com', 'vi', now() - interval '10 days', null),
  ('a0000000-0000-4000-8000-000000000002', 'pending@example.com', 'en', null, null),
  ('a0000000-0000-4000-8000-000000000003', 'left@example.com', 'en', now() - interval '20 days', now() - interval '1 day');

-- Issuing ---------------------------------------------------------------------------------------
select is(
  public.issue_newsletter_unsubscribe_tokens(
    array['a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003']::uuid[],
    array[repeat('1', 64), repeat('2', 64), repeat('3', 64)]
  ),
  1,
  'tokens are stored for active subscribers only'
);
select is(
  public.issue_newsletter_unsubscribe_tokens(array['a0000000-0000-4000-8000-000000000001']::uuid[], array[repeat('4', 64)]),
  1,
  'a later export adds a fresh token; the earlier one keeps working'
);
select throws_ok(
  $$select public.issue_newsletter_unsubscribe_tokens(array['a0000000-0000-4000-8000-000000000001']::uuid[], array['plain-token'])$$,
  '22023', 'invalid token hash', 'only SHA-256 hex digests are stored'
);
select throws_ok(
  $$select public.issue_newsletter_unsubscribe_tokens(array['a0000000-0000-4000-8000-000000000001']::uuid[], array[repeat('5', 64), repeat('6', 64)])$$,
  '22023', 'ids and hashes must pair up', 'ids and hashes pair up'
);

-- Unsubscribing ---------------------------------------------------------------------------------
select is(public.unsubscribe_newsletter('not-a-hash'), 'invalid', 'a malformed hash does nothing');
select is(public.unsubscribe_newsletter(repeat('2', 64)), 'invalid', 'a token never issued (pending subscriber) does nothing');
select is(public.unsubscribe_newsletter(repeat('1', 64)), 'unsubscribed', 'the token unsubscribes');
select ok(
  (select unsubscribed_at is not null from public.subscribers where email = 'active@example.com'),
  'unsubscribed_at is set'
);
select is(
  (select purpose::text || '|' || granted || '|' || document_version from public.consent_records where subject_email = 'active@example.com'),
  'marketing|false|newsletter-unsubscribe',
  'the withdrawal is recorded in consent_records'
);
select is(public.unsubscribe_newsletter(repeat('1', 64)), 'invalid', 'a token works only once');
select is(public.unsubscribe_newsletter(repeat('4', 64)), 'already', 'another token of a subscriber who already left changes nothing');
select is(
  (select count(*)::int from public.consent_records where subject_email = 'active@example.com'),
  1,
  'one withdrawal row, however many links are pressed'
);

-- Deleting a subscriber (account deletion, ADR-037) removes their tokens.
delete from public.subscribers where email = 'active@example.com';
select is(
  (select count(*)::int from public.newsletter_unsubscribe_tokens where subscriber_id = 'a0000000-0000-4000-8000-000000000001'),
  0,
  'tokens go with the subscriber row'
);

select * from finish();
rollback;
