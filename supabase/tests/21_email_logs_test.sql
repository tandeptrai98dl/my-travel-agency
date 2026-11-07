-- Transactional email log (Phase 4 PR 4E): exactly-once keys, allowed statuses, and no writes or
-- reads for API roles other than an MFA-verified admin's read.
begin;
select plan(9);

select has_column('public', 'email_logs', 'dedupe_key', 'email_logs has a dedupe key');

insert into public.email_logs (to_email, template, subject, status, dedupe_key)
values ('lan@example.com', 'booking_confirmed', 'Đã xác nhận', 'queued', 'booking_confirmed:test-1');

select throws_ok(
  $$insert into public.email_logs (to_email, template, subject, status, dedupe_key)
    values ('lan@example.com', 'booking_confirmed', 'Đã xác nhận', 'queued', 'booking_confirmed:test-1')$$,
  '23505', null,
  'a second email with the same dedupe key cannot be claimed'
);
select lives_ok(
  $$insert into public.email_logs (to_email, template, subject, status) values
      ('lan@example.com', 'contact_staff', 'Liên hệ', 'sent'),
      ('lan@example.com', 'contact_staff', 'Liên hệ', 'sent')$$,
  'emails without a dedupe key may repeat'
);
select lives_ok(
  $$update public.email_logs set status = 'skipped' where dedupe_key = 'booking_confirmed:test-1'$$,
  'the outcome is recorded on the claimed row'
);
select throws_ok(
  $$insert into public.email_logs (to_email, template, subject, status) values ('lan@example.com', 'x', 'x', 'delivered')$$,
  '23514', null,
  'only queued, sent, failed and skipped are valid statuses'
);

select ok(
  not has_table_privilege('anon', 'public.email_logs', 'insert')
  and not has_table_privilege('anon', 'public.email_logs', 'update')
  and not has_table_privilege('anon', 'public.email_logs', 'delete'),
  'anon cannot write the email log'
);

-- A signed-in customer: no rows visible, no writes.
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000002101', 'customer-21@example.com');
select set_config('request.jwt.claims', json_build_object('sub', '10000000-0000-4000-8000-000000002101', 'role', 'authenticated', 'aal', 'aal1')::text, true);
set local role authenticated;
select is((select count(*)::int from public.email_logs), 0, 'a customer reads no email log rows');
select throws_ok(
  $$insert into public.email_logs (to_email, template, subject, status) values ('x@example.com', 'x', 'x', 'sent')$$,
  '42501', null,
  'a customer cannot write the email log'
);
select results_eq(
  $$with changed as (update public.email_logs set status = 'sent' where dedupe_key = 'booking_confirmed:test-1' returning 1)
    select count(*)::int from changed$$,
  $$values (0)$$,
  'a customer cannot change an email log row'
);
reset role;

select * from finish();
rollback;
