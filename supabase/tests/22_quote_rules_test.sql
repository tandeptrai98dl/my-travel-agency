-- #34 review backlog (*_quote_private_only.sql): quotes only for private tours; the snapshot's
-- title falls back to the other language, then to the tour code.
begin;
select plan(4);

insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-4000-8000-000000002201', 'sales-22@example.test', '{}');
update public.profiles set role = 'sales' where id = '00000000-0000-4000-8000-000000002201';

insert into public.tours (id, code, type, scope, status, duration_days, duration_nights, from_price) values
  ('40000000-0000-4000-8000-000000002201', 'QR-PRIV-01', 'private', 'domestic', 'draft', 3, 2, 0),
  ('40000000-0000-4000-8000-000000002202', 'QR-PRIV-02', 'private', 'domestic', 'draft', 3, 2, 0),
  ('40000000-0000-4000-8000-000000002203', 'QR-GROUP-01', 'group', 'domestic', 'draft', 3, 2, 0);
insert into public.tour_translations (tour_id, locale, slug, title, summary) values
  ('40000000-0000-4000-8000-000000002201', 'vi', 'hanh-trinh-rieng-22', 'Hành trình riêng Tây Bắc', 'Tóm tắt'),
  ('40000000-0000-4000-8000-000000002203', 'vi', 'tour-doan-22', 'Tour đoàn', 'Tóm tắt');

create function pg_temp.quote(tour uuid)
returns uuid
language sql
as $$
  select public.create_quote(jsonb_build_object(
    'tour_id', tour, 'start_date', public.vietnam_today() + 90, 'locale', 'en', 'adults', 2,
    'price_adult', 20000000, 'payment_plan', 'full', 'valid_days', 5,
    'contact_name', 'Anna Berg', 'contact_email', 'anna@example.test', 'contact_phone', '+46 70 000 00 00'))
$$;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-000000002201', 'role', 'authenticated', 'aal', 'aal1')::text, true);
set local role authenticated;
select throws_ok($$ select pg_temp.quote('40000000-0000-4000-8000-000000002203') $$, 'P0002', null, 'a group tour cannot be quoted');
select lives_ok($$ select pg_temp.quote('40000000-0000-4000-8000-000000002201') $$, 'a private tour can be quoted');
select lives_ok($$ select pg_temp.quote('40000000-0000-4000-8000-000000002202') $$, 'a private tour without any title can be quoted');
reset role;

select results_eq(
  $$ select b.tour_snapshot ->> 'title' from public.bookings b join public.tours t on t.id = b.tour_id
      where t.code in ('QR-PRIV-01', 'QR-PRIV-02') order by t.code $$,
  $$ values ('Hành trình riêng Tây Bắc'), ('QR-PRIV-02') $$,
  'an English quote takes the Vietnamese title when there is no English one, else the tour code'
);

select * from finish();
rollback;
