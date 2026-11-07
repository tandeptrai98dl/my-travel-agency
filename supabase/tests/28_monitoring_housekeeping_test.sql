-- Phase 6 PR 6B (*_monitoring_housekeeping.sql): the missed-run rule, failed and missed pg_cron
-- runs, the access-token cleanup, the webhook payload trim (never unmatched or error rows; an
-- unmatched transfer older than 400 days can still be assigned afterwards), the job history purge
-- and the schedules.
begin;
select plan(46);

create function pg_temp.claims(uid uuid, aal text default 'aal1')
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
$$;

-- Privileges -------------------------------------------------------------------------------------------
select ok(
  not exists (
    select 1
      from unnest(array[
        'public.cron_job_overdue(text, timestamptz, timestamptz)', 'public.cron_failures(timestamptz)',
        'public.cleanup_booking_access_tokens()', 'public.trim_webhook_payloads()', 'public.purge_cron_history()'
      ]) fn, unnest(array['public', 'anon', 'authenticated']) r
     where case when r = 'public'
                then exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                              where p.oid = fn::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE')
                else has_function_privilege(r, fn, 'execute') end
  ),
  'no API role (nor public) may execute the monitoring and housekeeping functions'
);
select ok(
  (select bool_and(has_function_privilege('service_role', fn, 'execute'))
     from unnest(array[
       'public.cron_failures(timestamptz)', 'public.cleanup_booking_access_tokens()', 'public.trim_webhook_payloads()',
       'public.purge_cron_history()'
     ]) fn),
  'the service role executes them'
);
select ok(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
     from pg_proc p
    where p.oid in ('public.cron_failures(timestamptz)'::regprocedure, 'public.cleanup_booking_access_tokens()'::regprocedure,
                    'public.trim_webhook_payloads()'::regprocedure, 'public.purge_cron_history()'::regprocedure)),
  'they are security definer with an empty search_path'
);

-- The missed-run rule ---------------------------------------------------------------------------------
select is(public.cron_job_overdue('*/5 * * * *', now() - interval '14 minutes', now()), false, 'a 5-minute job is fine 14 minutes after a success');
select is(public.cron_job_overdue('*/5 * * * *', now() - interval '16 minutes', now()), true, 'a 5-minute job is missed after three intervals');
select is(public.cron_job_overdue('*/15 * * * *', now() - interval '44 minutes', now()), false, 'a 15-minute job is fine at 44 minutes');
select is(public.cron_job_overdue('*/15 * * * *', now() - interval '46 minutes', now()), true, 'a 15-minute job is missed after 45 minutes');
select is(public.cron_job_overdue('45 19 * * *', now() - interval '25 hours', now()), false, 'a daily job is fine at 25 hours');
select is(public.cron_job_overdue('45 19 * * *', now() - interval '27 hours', now()), true, 'a daily job is missed after 26 hours');
select is(public.cron_job_overdue('0 * * * *', now() - interval '2 hours 59 minutes', now()), false, 'an hourly job is fine under 3 hours');
select is(public.cron_job_overdue('0 * * * *', now() - interval '3 hours 1 minute', now()), true, 'an hourly job is missed after 3 hours');
select is(public.cron_job_overdue('* * * * *', now() - interval '4 minutes', now()), true, 'a job every minute is missed after 3 minutes');
select is(public.cron_job_overdue('*/5 * * * *', null, now()), false, 'a job that never ran is not judged');
select is(public.cron_job_overdue('0 3 1 * *', now() - interval '40 days', now()), false, 'monthly schedules are not judged');
select is(public.cron_job_overdue('15 19 * * 1-5', now() - interval '3 days', now()), false, 'weekday schedules are not judged');

-- Failed and missed runs, the history purge and the schedules (only where pg_cron exists; the local
-- shim has none, CI's Supabase has it) ------------------------------------------------------------------
create function pg_temp.cron_case()
returns text
language plpgsql
as $$
declare
  daily bigint;
  fast bigint;
  rows text;
  purged int;
  scheduled int;
begin
  daily := cron.schedule('test-daily', '10 20 * * *', 'select 1');
  fast := cron.schedule('test-fast', '*/5 * * * *', 'select 1');
  -- The daily job last succeeded 27 hours ago and failed an hour ago; the fast job last succeeded
  -- 20 minutes ago; an old failure (2 days) is outside the window; a run from 40 days ago is purged.
  insert into cron.job_run_details (jobid, runid, job_pid, database, username, command, status, return_message, start_time, end_time)
  values
    (daily, -2801, 0, current_database(), current_user, 'select 1', 'succeeded', '1 row', now() - interval '27 hours', now() - interval '27 hours'),
    (daily, -2802, 0, current_database(), current_user, 'select 1', 'failed', 'ERROR: email: 1 stuck in queued', now() - interval '1 hour', now() - interval '1 hour'),
    (daily, -2803, 0, current_database(), current_user, 'select 1', 'failed', 'ERROR: old', now() - interval '2 days', now() - interval '2 days'),
    (daily, -2804, 0, current_database(), current_user, 'select 1', 'succeeded', '1 row', now() - interval '40 days', now() - interval '40 days'),
    (fast, -2805, 0, current_database(), current_user, 'select 1', 'succeeded', '1 row', now() - interval '20 minutes', now() - interval '20 minutes');
  select string_agg(f.kind || ':' || f.job_name, '|' order by f.kind, f.job_name) into rows
    from public.cron_failures(now() - interval '1 day') f
   where f.job_name like 'test-%';
  purged := (select count(*) from cron.job_run_details where runid = -2804);
  perform public.purge_cron_history();
  purged := purged - (select count(*) from cron.job_run_details where runid = -2804);
  scheduled := (select count(*) from cron.job where jobname in ('booking-tokens-cleanup', 'webhook-payload-trim', 'cron-history-purge'));
  return rows || '; purged ' || purged || '; scheduled ' || scheduled;
end;
$$;

select case when to_regclass('cron.job_run_details') is null
  then skip('needs pg_cron (CI has it; the local shim does not)', 1)
  else is(
    pg_temp.cron_case(),
    'failed:test-daily|missed:test-daily|missed:test-fast; purged 1; scheduled 3',
    'cron_failures(): the failed run in the window and both overdue jobs; old history purged; the three jobs scheduled'
  ) end;
select case when to_regclass('cron.job_run_details') is not null
  then skip('pg_cron is installed', 1)
  else ok(
    not exists (select 1 from public.cron_failures(now() - interval '1 day')) and public.purge_cron_history() = 0,
    'without pg_cron: no failures reported and nothing purged'
  ) end;

-- Access tokens -----------------------------------------------------------------------------------------
insert into public.bookings (id, code, type, status, tour_id, start_date, adults, contact_name, contact_email, contact_phone,
                             locale, subtotal, total, deposit_amount, payment_plan, tour_snapshot)
select '28000000-0000-4000-8000-000000000001', 'PTA-2811-0001', 'instant', 'confirmed', t.id, current_date + 30, 1, 'Đỗ Minh',
       'tok28@example.test', '+84900002801', 'vi', 1000000, 1000000, 300000, 'deposit', '{}'
  from public.tours t limit 1;
insert into public.booking_access_tokens (booking_id, purpose, token_hash, expires_at, used_at, created_at)
select '28000000-0000-4000-8000-000000000001', 'email', repeat(v.n, 64), now() + v.expires, now() + v.used, now() - interval '60 days'
  from (values
    ('a', interval '5 days', interval '-31 days'),     -- used a month ago: removed
    ('b', interval '-31 days', null::interval),        -- expired a month ago, never used: removed
    ('c', interval '-40 days', interval '-35 days'),   -- both long ago: removed
    ('d', interval '5 days', interval '-29 days'),     -- used 29 days ago: kept
    ('e', interval '-29 days', null::interval),        -- expired 29 days ago: kept
    ('f', interval '6 days', null::interval)           -- still open: kept
  ) v(n, expires, used);
select is(public.cleanup_booking_access_tokens(), 3, 'three tokens used or expired more than 30 days ago are removed');
select is(
  (select string_agg(left(token_hash, 1), '' order by token_hash) from public.booking_access_tokens
    where booking_id = '28000000-0000-4000-8000-000000000001'),
  'def', 'tokens used or expired within 30 days, and open ones, stay'
);
select is(public.cleanup_booking_access_tokens(), 0, 'a second run removes nothing');

-- Webhook payloads --------------------------------------------------------------------------------------
insert into public.webhook_events (provider, event_key, payload, received_at, processed_at, error)
select v.provider::public.payment_provider, v.event_key, jsonb_build_object('id', v.event_key, 'transferAmount', 1000), now() - v.age,
       case when v.processed then now() - v.age end, v.error
  from (values
    ('vnpay', 't28-recorded', interval '401 days', true, null::text),
    ('vnpay', 't28-duplicate', interval '401 days', true, 'duplicate_transaction'),
    ('bank_transfer', 't28-assigned', interval '401 days', true, 'assigned'),
    ('bank_transfer', 't28-unmatched', interval '401 days', true, 'unmatched'),
    ('vnpay', 't28-failed', interval '401 days', true, 'failed'),
    ('bank_transfer', 't28-invalid', interval '401 days', true, 'invalid_amount'),
    ('vnpay', 't28-unfinished', interval '401 days', false, null),
    ('vnpay', 't28-recent', interval '399 days', true, null)
  ) v(provider, event_key, age, processed, error);
select is(public.trim_webhook_payloads(), 3, 'three old events whose payload is copied into payments are trimmed');
select is(
  (select string_agg(event_key, ',' order by event_key) from public.webhook_events where event_key like 't28-%' and payload = '{}'),
  't28-assigned,t28-duplicate,t28-recorded', 'recorded, duplicate and assigned events lose their payload'
);
select is(
  (select string_agg(event_key, ',' order by event_key) from public.webhook_events where event_key like 't28-%' and payload <> '{}'),
  't28-failed,t28-invalid,t28-recent,t28-unfinished,t28-unmatched',
  'unmatched, failed, invalid, unfinished and recent events keep theirs'
);
select is((select count(*)::int from public.webhook_events where event_key like 't28-%'), 8, 'every row stays as idempotency proof');
select is(
  (select processed_at is not null and received_at < now() - interval '400 days' from public.webhook_events where event_key = 't28-recorded'),
  true, 'a trimmed row keeps its times'
);
select is(public.trim_webhook_payloads(), 0, 'a second run trims nothing');

-- An unmatched transfer older than 400 days is still assignable after the trim -------------------------
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-4000-8000-000000002801', 'acc28@example.test', '{}');
update public.profiles set role = 'accountant' where id = '00000000-0000-4000-8000-000000002801';
insert into public.departures (id, tour_id, start_date, end_date, capacity, price_adult)
select '28100000-0000-4000-8000-000000000001', t.id, public.vietnam_today() + 60, public.vietnam_today() + 62, 6, 10000000
  from public.tours t where t.code = 'VN-HLB-03';
select isnt(
  public.create_draft_booking(jsonb_build_object(
    'idempotency_key', 'm28', 'tour_id', (select tour_id from public.departures where id = '28100000-0000-4000-8000-000000000001'),
    'departure_id', '28100000-0000-4000-8000-000000000001', 'locale', 'vi', 'adults', 1, 'children', 0, 'infants', 0, 'single_rooms', 0,
    'contact_name', 'Phạm Hà', 'contact_email', 'm28@example.test', 'contact_phone', '+84 900 000 028',
    'payment_plan', 'deposit', 'subtotal', 10000000, 'total', 10000000, 'deposit_amount', 3000000,
    'items', jsonb_build_array(jsonb_build_object('type', 'adult', 'unit_price', 10000000, 'quantity', 1, 'amount', 10000000)))),
  null, 'a booking waiting for a transfer'
);
select is(
  public.reserve_and_create_payment((select id from public.bookings where idempotency_key = 'm28'), 'bank_transfer', 'deposit') ->> 'booking_status',
  'pending_payment', 'its seats are held'
);
select is(
  public.record_payment_event('bank_transfer', 'sepay:2899', '{"id": 2899, "transferType": "in", "transferAmount": 3000000, "content": "ck tour"}',
                              '', 3000000, 'sepay:2899', true) ->> 'result',
  'unmatched', 'a transfer without a reference is kept as unmatched'
);
update public.webhook_events set received_at = now() - interval '401 days', processed_at = now() - interval '401 days'
 where event_key = 'sepay:2899';
select is(public.trim_webhook_payloads(), 0, 'the trim leaves the 401-day-old unmatched transfer alone');
select is(
  (select (payload ->> 'transferAmount')::bigint from public.webhook_events where event_key = 'sepay:2899'),
  3000000::bigint, 'its amount is still in the payload'
);
select pg_temp.claims('00000000-0000-4000-8000-000000002801', 'aal2');
set local role authenticated;
select is(
  public.assign_unmatched_transfer((select id from public.webhook_events where event_key = 'sepay:2899'),
                                   (select id from public.bookings where idempotency_key = 'm28'), 'receipt from the customer') ->> 'status',
  'confirmed', 'an accountant still assigns it after the trim, with the webhook''s amount'
);
reset role;
select is(
  (select amount from public.payments p join public.bookings b on b.id = p.booking_id
    where b.idempotency_key = 'm28' and p.status = 'succeeded'),
  3000000::bigint, 'the payment carries the amount from the payload'
);
select is(
  (select raw_response ->> 'transferAmount' from public.payments p join public.bookings b on b.id = p.booking_id
    where b.idempotency_key = 'm28' and p.status = 'succeeded'),
  '3000000', 'and a copy of the payload'
);
select is((select error from public.webhook_events where event_key = 'sepay:2899'), 'assigned', 'the event is now assigned');
select is(public.trim_webhook_payloads(), 1, 'once assigned (payload copied into the payment), the old event is trimmed');
select is((select payload from public.webhook_events where event_key = 'sepay:2899'), '{}'::jsonb, 'its payload is empty');
select is(
  (select payload ->> 'transferAmount' from public.webhook_events where event_key = 'assigned:' || (select id from public.webhook_events where event_key = 'sepay:2899')),
  '3000000', 'the assignment''s own event is recent and keeps its payload'
);
select is(
  (select raw_response ->> 'transferAmount' from public.payments p join public.bookings b on b.id = p.booking_id
    where b.idempotency_key = 'm28' and p.status = 'succeeded'),
  '3000000', 'the payment''s copy is untouched by the trim'
);

-- Nothing else is deleted -------------------------------------------------------------------------------
select ok(
  not exists (
    select 1 from pg_proc p
     where p.oid in ('public.cleanup_booking_access_tokens()'::regprocedure, 'public.trim_webhook_payloads()'::regprocedure,
                     'public.purge_cron_history()'::regprocedure)
       and p.prosrc ~* '(email_logs|audit_logs|consent_records|public\.bookings|public\.payments)'
  ),
  'the housekeeping functions never touch email logs, audit logs, consents, bookings or payments (decision 4)'
);
select ok(
  (select prosrc ~ 'w\.error is null or w\.error in \(''duplicate_transaction'', ''assigned''\)' from pg_proc
    where oid = 'public.trim_webhook_payloads()'::regprocedure),
  'the trim predicate names exactly the copied outcomes'
);
select ok(
  (select prosrc ~ 'least\(coalesce\(t\.used_at, ''infinity''::timestamptz\), t\.expires_at\) < now\(\) - interval ''30 days''' from pg_proc
    where oid = 'public.cleanup_booking_access_tokens()'::regprocedure),
  'the token predicate is the spec''s'
);

-- As an API role -----------------------------------------------------------------------------------------
select pg_temp.claims('00000000-0000-4000-8000-000000002801', 'aal2');
set local role authenticated;
select throws_ok($$ select public.trim_webhook_payloads() $$, '42501', null, 'an accountant cannot run the trim');
select throws_ok($$ select * from public.cron_failures(now()) $$, '42501', null, 'nor read cron failures');
select throws_ok($$ select public.cleanup_booking_access_tokens() $$, '42501', null, 'nor clean up tokens');
reset role;
set local role anon;
select throws_ok($$ select public.purge_cron_history() $$, '42501', null, 'anon cannot purge the job history');
reset role;

select * from finish();
rollback;
