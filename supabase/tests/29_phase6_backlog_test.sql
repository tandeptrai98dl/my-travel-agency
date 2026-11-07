-- Phase 6 PR 6B backlog (*_phase6_backlog.sql): failed emails are windowed on failed_at, and the
-- dashboard counts confirmed and completed travellers per departure, as departures_below_minimum()
-- does.
begin;
select plan(12);

create function pg_temp.as_user(uid uuid, aal text default 'aal1')
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
$$;

-- failed_at -----------------------------------------------------------------------------------------
delete from public.email_logs;
insert into public.email_logs (id, to_email, template, subject, status, dedupe_key, created_at) values
  ('29000000-0000-4000-8000-000000000001', 'a29@example.test', 'booking_confirmed', 'S', 'queued', 'k29:1', now() - interval '1 hour'),
  ('29000000-0000-4000-8000-000000000002', 'b29@example.test', 'booking_confirmed', 'S', 'failed', 'k29:2', now() - interval '2 hours');
select ok(
  (select failed_at between now() - interval '1 second' and now() from public.email_logs where id = '29000000-0000-4000-8000-000000000002'),
  'a row written as failed gets failed_at'
);
select is((select failed_at from public.email_logs where id = '29000000-0000-4000-8000-000000000001'), null, 'a queued row has none');

-- An hour-old claim that fails now: the old window (created_at) missed it; the new one alerts.
update public.email_logs set status = 'sent' where id = '29000000-0000-4000-8000-000000000002';
select is((select failed_at from public.email_logs where id = '29000000-0000-4000-8000-000000000002'), null, 'leaving failed clears it');
update public.email_logs set failed_at = now() - interval '1 day' where id = '29000000-0000-4000-8000-000000000001';
select is((select failed_at from public.email_logs where id = '29000000-0000-4000-8000-000000000001'), null, 'only a failed row carries it');
update public.email_logs set status = 'failed', error = 'HTTP 500' where id = '29000000-0000-4000-8000-000000000001';
select ok(
  (select failed_at > now() - interval '1 minute' from public.email_logs where id = '29000000-0000-4000-8000-000000000001'),
  'the change to failed sets the time it failed, not the claim time'
);
select throws_ok(
  $$ select public.raise_on_email_problems() $$, 'P0001',
  'email: 0 stuck in queued, 1 failed in the last 15 minutes; see email_logs and README "Runbooks"',
  'a send that failed an hour after its claim still alerts'
);
update public.email_logs set failed_at = now() - interval '16 minutes' where id = '29000000-0000-4000-8000-000000000001';
select lives_ok($$ select public.raise_on_email_problems() $$, 'a failure older than 15 minutes has already alerted');
update public.email_logs set status = 'failed', error = 'HTTP 500', failed_at = now() - interval '20 minutes'
 where id = '29000000-0000-4000-8000-000000000002';
select ok(
  (select failed_at < now() - interval '19 minutes' from public.email_logs where id = '29000000-0000-4000-8000-000000000002'),
  'an explicit failed_at is kept'
);
select ok(
  (select p.prosrc ~ 'failed_at > now\(\) - interval ''15 minutes''' from pg_proc p where p.oid = 'public.raise_on_email_problems()'::regprocedure),
  'the alert windows failures on failed_at'
);
insert into public.email_logs (to_email, template, subject, status, dedupe_key)
values ('team29@example.test', 'cron_alert', 'S', 'failed', 'cron_failure:x29:2026-11-10T01:00:00.000Z');
select lives_ok(
  $$ select public.raise_on_email_problems() $$,
  'a failed health-check alert email does not fail the email alert (no feedback loop on a Resend outage)'
);

-- Dashboard and departures_below_minimum() agree -------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-4000-8000-000000002901', 'op29@example.test', '{}');
update public.profiles set role = 'operator' where id = '00000000-0000-4000-8000-000000002901';
update public.tours set min_pax_to_operate = 9 where code = 'VN-HLB-03';
insert into public.departures (id, tour_id, start_date, end_date, capacity, price_adult)
select '29100000-0000-4000-8000-000000000001', t.id, public.vietnam_today() + 6, public.vietnam_today() + 8, 12, 10000000
  from public.tours t where t.code = 'VN-HLB-03';
insert into public.bookings (id, code, type, status, tour_id, departure_id, start_date, adults, children, contact_name, contact_email,
                             contact_phone, locale, subtotal, total, deposit_amount, payment_plan, tour_snapshot)
select v.id, v.code, 'instant', v.status::public.booking_status, d.tour_id, d.id, d.start_date, v.adults, 0, 'Khách 29',
       'c29@example.test', '+84900002901', 'vi', 1000000, 1000000, 300000, 'deposit', '{}'
  from (values
    ('29200000-0000-4000-8000-000000000001'::uuid, 'PTA-2911-0001', 'confirmed', 1),
    ('29200000-0000-4000-8000-000000000002'::uuid, 'PTA-2911-0002', 'completed', 2),
    ('29200000-0000-4000-8000-000000000003'::uuid, 'PTA-2911-0003', 'cancelled', 4)
  ) v(id, code, status, adults)
  cross join (select * from public.departures where id = '29100000-0000-4000-8000-000000000001') d;
select is(
  (select (d ->> 'confirmed')::int from jsonb_array_elements(public.departures_below_minimum(21)) d
    where d ->> 'departure_id' = '29100000-0000-4000-8000-000000000001'),
  3, 'departures_below_minimum() counts confirmed and completed travellers'
);
select pg_temp.as_user('00000000-0000-4000-8000-000000002901');
set local role authenticated;
select is(
  (select (d ->> 'confirmed')::int from jsonb_array_elements(public.admin_dashboard() #> '{operations,departures}') d
    where d ->> 'id' = '29100000-0000-4000-8000-000000000001'),
  3, 'the dashboard shows the same number for the departure'
);
reset role;

select * from finish();
rollback;
