-- Phase 6 PR 6A (docs/specs/phase-6-hardening-launch.md decision 1): every `security definer`
-- function in `public` pins `search_path = ''`, and none can be executed by `public`, `anon` or
-- `authenticated` unless it is on the allow-list below. A new definer function therefore fails
-- this test until it is either service-role only (the rule for data-changing functions, ADR-012)
-- or added here with the reason it is safe to call from a session (docs/SECURITY_REVIEW.md).
begin;
select plan(7);

create temp table allowed (fn text primary key, anon boolean not null, why text not null);
insert into allowed values
  -- Role helpers: RLS policies call them as the API roles, so they must stay executable. They
  -- only read the caller's own profile and JWT claims.
  ('can_act_as(user_role[])', true, 'role helper used by policies'),
  ('current_user_role()', true, 'role helper used by policies'),
  ('has_role(user_role[])', true, 'role helper used by policies'),
  ('is_admin()', true, 'role helper used by policies'),
  ('is_mfa_verified()', true, 'role helper used by policies'),
  ('is_staff()', true, 'role helper used by policies'),
  ('is_staff_or_trusted()', false, 'gate of the definer helpers below'),
  -- Public read: the booking cut-off from the private booking_rules setting, a number only.
  ('booking_cutoff_days()', true, 'public tour pages (search)'),
  -- Customer-safe functions: the caller's own bookings (customer_id = auth.uid()), fixed columns.
  ('customer_booking(text)', false, 'customer-safe read'),
  ('customer_bookings()', false, 'customer-safe read'),
  ('save_customer_travellers(text,jsonb)', false, 'customer-safe write of own travellers'),
  -- Role-checked staff functions: each checks can_act_as() (and aal2 where the matrix needs it)
  -- before it reads or writes, and writes audit rows; their own pgTAP files test the refusals.
  ('add_inquiry_note(uuid,text,boolean)', false, 'staff: inquiries'),
  ('assign_inquiry(uuid,uuid)', false, 'staff: inquiries'),
  ('update_inquiry_status(uuid,inquiry_status,text)', false, 'staff: inquiries'),
  ('can_read_inquiry(uuid)', false, 'staff: inquiries (caller''s own rights)'),
  ('can_work_inquiry(uuid)', false, 'staff: inquiries (caller''s own rights)'),
  ('inquiry_activity(uuid)', false, 'staff: inquiries'),
  ('inquiry_consents(uuid)', false, 'staff: inquiries'),
  ('create_quote(jsonb)', false, 'staff: quotes'),
  ('create_payment_link(uuid,text,integer)', false, 'staff: payment links'),
  ('record_manual_payment(uuid,bigint,payment_provider,text)', false, 'staff: payments (accountant/admin, aal2)'),
  ('record_refund(uuid,bigint,payment_provider,text)', false, 'staff: payments (accountant/admin, aal2)'),
  ('assign_unmatched_transfer(uuid,uuid,text)', false, 'staff: payments (accountant/admin, aal2)'),
  ('request_cancellation(uuid,text)', false, 'staff: bookings'),
  ('resolve_attention(uuid,text)', false, 'staff: bookings'),
  ('staff_cancel_booking(uuid,text)', false, 'staff: bookings (operator/admin)'),
  ('departure_has_open_bookings(uuid)', false, 'staff: departure rules (false for non-booking roles)'),
  ('lock_tour_row(uuid)', false, 'staff: tour rules (no-op unless staff)'),
  ('media_used_in_content(uuid)', false, 'staff: media rules (false unless staff)'),
  ('export_departure_passengers(uuid)', false, 'staff: operations (operator/admin, audited)'),
  ('admin_dashboard()', false, 'staff: dashboard (sections per role)'),
  ('customer_consents(uuid)', false, 'staff: customers'),
  ('admin_anonymise_customer(uuid,text)', false, 'staff: customers (admin, aal2)'),
  ('admin_deletion_requests(uuid)', false, 'staff: customers (admin, aal2)');

create temp table definers as
select p.oid::regprocedure::text as fn,
       coalesce(p.proconfig, '{}') as config,
       has_function_privilege('public', p.oid, 'execute') as by_public,
       has_function_privilege('anon', p.oid, 'execute') as by_anon,
       has_function_privilege('authenticated', p.oid, 'execute') as by_authenticated
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef;

select cmp_ok((select count(*)::int from definers), '>', 80, 'the definer functions are found (vacuity guard)');

select is(
  (select string_agg(fn, ', ' order by fn) from definers where not ('search_path=""' = any (config))),
  null,
  'every security definer function sets search_path = '''''
);

select is(
  (select string_agg(fn, ', ' order by fn) from definers where by_public),
  null,
  'no security definer function is executable by public'
);

select is(
  (select string_agg(d.fn, ', ' order by d.fn) from definers d
    where d.by_authenticated and not exists (select 1 from allowed a where a.fn = d.fn)),
  null,
  'authenticated executes only allow-listed definer functions'
);

select is(
  (select string_agg(d.fn, ', ' order by d.fn) from definers d
    where d.by_anon and not exists (select 1 from allowed a where a.fn = d.fn and a.anon)),
  null,
  'anon executes only the role helpers and the public booking cut-off'
);

select is(
  (select string_agg(a.fn, ', ' order by a.fn) from allowed a
    where not exists (select 1 from definers d where d.fn = a.fn and d.by_authenticated and d.by_anon = a.anon)),
  null,
  'every allow-list entry exists with exactly the grants it states (no stale entries)'
);

select ok(
  (select bool_and(has_function_privilege('service_role', p.oid, 'execute'))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype),
  'the service role executes every non-trigger definer function'
);

select * from finish();
rollback;
