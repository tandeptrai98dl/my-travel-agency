-- Quotes and payment links (*_quotes_payment_links.sql, spec Phase 4 PR 4D).
begin;
select plan(20);

create function pg_temp.claims(uid uuid, aal text default 'aal1')
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000002001', 'sales-q@example.test', '{}'),
  ('00000000-0000-4000-8000-000000002002', 'op-q@example.test', '{}');
update public.profiles set role = 'sales' where id = '00000000-0000-4000-8000-000000002001';
update public.profiles set role = 'operator' where id = '00000000-0000-4000-8000-000000002002';

create function pg_temp.quote(extra jsonb default '{}')
returns uuid
language sql
as $$
  select public.create_quote(jsonb_build_object(
    'tour_id', (select id from public.tours where type = 'private' and status = 'published' limit 1),
    'start_date', public.vietnam_today() + 90, 'locale', 'en', 'adults', 2, 'children', 1, 'infants', 0,
    'price_adult', 20000000, 'price_child', 10000000, 'payment_plan', 'deposit', 'valid_days', 5,
    'contact_name', 'Anna Berg', 'contact_email', 'Anna@Example.test', 'contact_phone', '+46 70 000 00 00') || extra)
$$;

select pg_temp.claims('00000000-0000-4000-8000-000000002002');
set local role authenticated;
select throws_ok($$ select pg_temp.quote() $$, '42501', null, 'operators cannot create quotes');
reset role;

select pg_temp.claims('00000000-0000-4000-8000-000000002001');
set local role authenticated;
select throws_ok($$ select pg_temp.quote('{"infants": 2, "adults": 1}') $$, 'P0001', 'invalid_quote', 'party rules apply');
select throws_ok($$ select pg_temp.quote('{"price_adult": 0}') $$, 'P0001', 'invalid_quote', 'a price is required');
select throws_ok(
  $$ select pg_temp.quote(jsonb_build_object('start_date', public.vietnam_today() + 5)) $$,
  'P0001', 'plan_unavailable', 'no deposit plan when the balance would already be due'
);
create temp table q as select pg_temp.quote() as id;
reset role;
grant select on q to authenticated;

select is((select status::text from public.bookings where id = (select id from q)), 'quoted', 'sales create a quoted booking');
select is((select total from public.bookings where id = (select id from q)), 50000000::bigint, 'two adults and a child at the staff prices');
select is((select deposit_amount from public.bookings where id = (select id from q)), 15000000::bigint, 'the tour''s deposit, rounded up to 1 000 đ');
select is((select assigned_to from public.bookings where id = (select id from q)), '00000000-0000-4000-8000-000000002001'::uuid, 'owned by the sales person');
select ok((select quote_expires_at between now() + interval '4 days 23 hours' and now() + interval '5 days 1 hour' from public.bookings where id = (select id from q)), 'the quote expires after the chosen days');
select is((select count(*)::int from public.booking_items where booking_id = (select id from q)), 2, 'price lines for adults and children');

-- Payment links ---------------------------------------------------------------------------------------
select pg_temp.claims('00000000-0000-4000-8000-000000002002');
set local role authenticated;
select throws_ok(
  format($$ select public.create_payment_link(%L, %L, 48) $$, (select id from q), repeat('a', 64)),
  '42501', null, 'operators cannot send payment links'
);
reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000002001');
set local role authenticated;
select throws_ok(
  format($$ select public.create_payment_link(%L, 'not-a-hash', 48) $$, (select id from q)),
  'P0001', 'invalid_link', 'only a SHA-256 hex is stored'
);
select is(
  (public.create_payment_link((select id from q), repeat('b', 64), 168) ->> 'amount')::bigint, 15000000::bigint,
  'a link for the deposit due now'
);
reset role;
select ok(
  (select expires_at <= (select quote_expires_at from public.bookings where id = (select id from q)) from public.payment_links where token_hash = repeat('b', 64)),
  'and it never outlives the quote'
);
select is(public.payment_link_state(repeat('b', 64)), 'valid', 'the link page sees a valid link');
select is(public.redeem_payment_link(repeat('b', 64)) ->> 'booking_id', (select id::text from q), 'opening it gives the booking');
select throws_ok($$ select public.redeem_payment_link(repeat('b', 64)) $$, 'P0001', 'link_used', 'a link opens once');
select is(public.payment_link_state(repeat('c', 64)), 'invalid', 'an unknown token is invalid');

set local role authenticated;
select throws_ok($$ select public.redeem_payment_link(repeat('b', 64)) $$, '42501', null, 'API roles cannot redeem links');
reset role;

-- The quote then pays through the standard functions.
select is(
  public.reserve_and_create_payment((select id from q), 'bank_transfer', 'deposit') ->> 'booking_status',
  'pending_payment', 'a quoted booking starts a payment like any other'
);

select * from finish();
rollback;
