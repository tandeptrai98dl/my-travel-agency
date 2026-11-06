-- Newsletter double opt-in functions (Phase 3 PR I): service role only, idempotent requests, a
-- single-use confirmation that records the marketing consent.
begin;
select plan(16);

-- Grants -------------------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.request_newsletter_subscription(text, public.locale, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.request_newsletter_subscription(text, public.locale, text, text)', 'execute'),
  'API roles cannot request subscriptions directly'
);
select ok(
  not has_function_privilege('anon', 'public.confirm_newsletter_subscription(text, text, inet, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.confirm_newsletter_subscription(text, text, inet, text)', 'execute'),
  'API roles cannot confirm subscriptions directly'
);
select ok(
  has_function_privilege('service_role', 'public.request_newsletter_subscription(text, public.locale, text, text)', 'execute')
  and has_function_privilege('service_role', 'public.confirm_newsletter_subscription(text, text, inet, text)', 'execute'),
  'the service role can call both'
);

-- Requests -----------------------------------------------------------------------------------
select is(
  public.request_newsletter_subscription('  Anna@Example.COM ', 'en', 'homepage', repeat('a', 64)),
  true,
  'a new address gets a confirmation email'
);
select is(
  (select email || '|' || locale || '|' || source || '|' || confirm_token_hash from public.subscribers where email = 'anna@example.com'),
  'anna@example.com|en|homepage|' || repeat('a', 64),
  'the address is stored lower-cased with the token hash, unconfirmed'
);
select is(
  public.request_newsletter_subscription('anna@example.com', 'vi', 'homepage', repeat('b', 64)),
  true,
  'asking again before confirming sends a new email'
);
select is(
  (select confirm_token_hash from public.subscribers where email = 'anna@example.com'),
  repeat('b', 64),
  'the new token replaces the old one'
);
select throws_ok(
  $$select public.request_newsletter_subscription('not-an-email', 'vi', 'homepage', repeat('c', 64))$$,
  '22023', 'invalid email', 'an invalid address is refused'
);
select throws_ok(
  $$select public.request_newsletter_subscription('lan@example.com', 'vi', 'homepage', 'plain-token')$$,
  '22023', 'invalid token hash', 'a token that is not a SHA-256 hex digest is refused'
);

-- Confirmation -------------------------------------------------------------------------------
select is(
  public.confirm_newsletter_subscription(repeat('a', 64), 'newsletter-2026-11'),
  false,
  'the replaced token no longer confirms'
);
select is(
  public.confirm_newsletter_subscription(repeat('b', 64), 'newsletter-2026-11', '203.0.113.7', 'Test agent'),
  true,
  'the current token confirms'
);
select ok(
  (select confirmed_at is not null and confirm_token_hash is null and unsubscribed_at is null
     from public.subscribers where email = 'anna@example.com'),
  'the subscriber is confirmed and the token cleared'
);
select is(
  (select purpose::text || '|' || granted || '|' || document_version || '|' || host(ip)
     from public.consent_records where subject_email = 'anna@example.com'),
  'marketing|true|newsletter-2026-11|203.0.113.7',
  'the marketing consent is recorded with its document version'
);
select is(
  public.confirm_newsletter_subscription(repeat('b', 64), 'newsletter-2026-11'),
  false,
  'a token works only once'
);
select is(
  public.request_newsletter_subscription('ANNA@example.com', 'vi', 'homepage', repeat('d', 64)),
  false,
  'an active subscriber gets no new email and is left untouched'
);

-- Resubscribing after an unsubscribe.
update public.subscribers set unsubscribed_at = now() where email = 'anna@example.com';
select is(
  public.request_newsletter_subscription('anna@example.com', 'vi', 'homepage', repeat('e', 64)),
  true,
  'an unsubscribed address can sign up again with a new confirmation'
);

select * from finish();
rollback;
