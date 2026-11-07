-- Phase 4 polish (*_email_polish.sql): single-use access tokens, staff reads of a booking's
-- emails, and the stuck/failed email alert.
begin;
select plan(17);

create function pg_temp.claims(uid uuid, aal text default 'aal1')
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
$$;

select ok(
  not has_function_privilege('anon', 'public.issue_booking_access_token(uuid, text, text, int)', 'execute')
  and not has_function_privilege('authenticated', 'public.issue_booking_access_token(uuid, text, text, int)', 'execute')
  and not has_function_privilege('authenticated', 'public.redeem_booking_access_token(text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.booking_access_token_state(text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.raise_on_email_problems()', 'execute'),
  'API roles cannot issue, check or redeem access tokens, or run the email alert'
);
select ok(
  has_function_privilege('service_role', 'public.issue_booking_access_token(uuid, text, text, int)', 'execute')
  and has_function_privilege('service_role', 'public.redeem_booking_access_token(text, text)', 'execute'),
  'the service role can issue and redeem access tokens'
);

-- Fixture: one draft booking on a seeded published group tour's departure.
insert into public.bookings (id, code, type, status, tour_id, departure_id, start_date, adults, contact_name, contact_email,
                             contact_phone, locale, subtotal, total, deposit_amount, payment_plan, tour_snapshot)
select '50000000-0000-4000-8000-000000002301', 'PTA-2611-9301', 'instant', 'draft', d.tour_id, d.id, d.start_date, 1,
       'Lan', 'lan@example.com', '+84 90 000 0000', 'vi', 1000000, 1000000, 1000000, 'full', '{}'::jsonb
  from public.departures d join public.tours t on t.id = d.tour_id and t.status = 'published' and t.type = 'group'
 order by d.start_date limit 1;

select lives_ok(
  $$ select public.issue_booking_access_token('50000000-0000-4000-8000-000000002301', 'email', repeat('a', 64), 10080) $$,
  'an email token is issued for a booking'
);
select throws_ok(
  $$ select public.issue_booking_access_token('50000000-0000-4000-8000-000000002301', 'email', 'not-a-hash', 60) $$,
  'P0001', 'invalid_token', 'only SHA-256 hex hashes are stored'
);
select throws_ok(
  $$ select public.issue_booking_access_token('50000000-0000-4000-8000-000000002301', 'other', repeat('b', 64), 60) $$,
  'P0001', 'invalid_token', 'only email and lookup purposes are allowed'
);
select is(public.booking_access_token_state('PTA-2611-9301', repeat('a', 64)), 'valid', 'a fresh token is valid');
select is(public.booking_access_token_state('PTA-0000-0000', repeat('a', 64)), 'invalid', 'a token opens only its own booking');
select is(
  (public.redeem_booking_access_token('PTA-2611-9301', repeat('a', 64)) ->> 'code'),
  'PTA-2611-9301',
  'the click redeems the token and names the booking'
);
select throws_ok(
  $$ select public.redeem_booking_access_token('PTA-2611-9301', repeat('a', 64)) $$,
  'P0001', 'link_used', 'a token works once'
);
select is(public.booking_access_token_state('PTA-2611-9301', repeat('a', 64)), 'used', 'a redeemed token reads as used');

insert into public.booking_access_tokens (booking_id, purpose, token_hash, expires_at)
values ('50000000-0000-4000-8000-000000002301', 'email', repeat('c', 64), now() - interval '1 minute');
select throws_ok(
  $$ select public.redeem_booking_access_token('PTA-2611-9301', repeat('c', 64)) $$,
  'P0001', 'link_expired', 'an expired token is refused'
);

-- Staff who read bookings see the booking's emails; customers and editors do not.
insert into public.email_logs (to_email, template, subject, status, booking_id, dedupe_key)
values ('lan@example.com', 'booking_confirmed', 'x', 'sent', '50000000-0000-4000-8000-000000002301', 'booking_confirmed:test-2301');
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000002301', 'sales-23@example.test', '{}'),
  ('00000000-0000-4000-8000-000000002302', 'editor-23@example.test', '{}'),
  ('00000000-0000-4000-8000-000000002303', 'customer-23@example.test', '{}');
update public.profiles set role = 'sales' where id = '00000000-0000-4000-8000-000000002301';
update public.profiles set role = 'editor' where id = '00000000-0000-4000-8000-000000002302';

select pg_temp.claims('00000000-0000-4000-8000-000000002301');
set local role authenticated;
select is((select count(*)::int from public.email_logs where dedupe_key = 'booking_confirmed:test-2301'), 1, 'sales read a booking''s emails');
select is((select count(*)::int from public.booking_access_tokens), 0, 'sales cannot read access tokens');
reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000002302');
set local role authenticated;
select is((select count(*)::int from public.email_logs), 0, 'editors read no email log rows');
reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000002303');
set local role authenticated;
select is((select count(*)::int from public.email_logs), 0, 'customers read no email log rows');
reset role;

-- The alert: quiet with nothing wrong, failing on a stuck or a failed email.
delete from public.email_logs where created_at > now() - interval '1 hour' and status in ('queued', 'failed');
select lives_ok($$ select public.raise_on_email_problems() $$, 'no stuck or failed email: the alert job passes');
insert into public.email_logs (to_email, template, subject, status, created_at)
values ('lan@example.com', 'booking_received', 'x', 'queued', now() - interval '12 minutes');
select throws_ok($$ select public.raise_on_email_problems() $$, 'P0001', null, 'an email stuck in queued fails the alert job');

select * from finish();
rollback;
