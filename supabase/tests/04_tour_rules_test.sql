-- Tour price guards and publish rules (docs/specs/phase-2-catalog-admin.md decisions 1 and 3,
-- step 11, ADR-024).
begin;
select plan(30);

create function pg_temp.claims(uid uuid, aal text default 'aal1')
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text,
    true
  );
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000412', 'operator-r@example.test', '{}'),
  ('00000000-0000-4000-8000-000000000413', 'sales-manager-r@example.test', '{}'),
  ('00000000-0000-4000-8000-000000000414', 'editor-r@example.test', '{}'),
  ('00000000-0000-4000-8000-000000000415', 'admin-r@example.test', '{}');
update public.profiles set role = 'operator' where id = '00000000-0000-4000-8000-000000000412';
update public.profiles set role = 'sales_manager' where id = '00000000-0000-4000-8000-000000000413';
update public.profiles set role = 'editor' where id = '00000000-0000-4000-8000-000000000414';
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000415';

insert into public.cancellation_policies (id, name, rules, summary) values
  ('70000000-0000-4000-8000-000000000401', 'Other policy', '[{"min_days_before": 0, "refund_percent": 0}]', '{}');
insert into public.media (id, path, mime_type, size_bytes, alt) values
  ('80000000-0000-4000-8000-000000000401', '2026/01/80000000-0000-4000-8000-000000000401.jpg',
   'image/jpeg', 1, '{"vi": "Thuyền trên vịnh", "en": "A boat on the bay"}'),
  ('80000000-0000-4000-8000-000000000402', '2026/01/80000000-0000-4000-8000-000000000402.jpg',
   'image/jpeg', 1, '{"vi": "Chỉ tiếng Việt"}');
insert into public.tours (id, code, type, scope, duration_days, duration_nights, from_price) values
  ('40000000-0000-4000-8000-000000000401', 'R-GROUP', 'group', 'domestic', 3, 2, 9000000),
  ('40000000-0000-4000-8000-000000000402', 'R-PRIVATE', 'private', 'domestic', 3, 2, 0);
insert into public.departures (id, tour_id, start_date, end_date, capacity, price_adult, price_child) values
  ('20000000-0000-4000-8000-000000000401', '40000000-0000-4000-8000-000000000401',
   current_date + 30, current_date + 32, 12, 9000000, 7000000);

-- Default columns the price guard writes for non-admin inserts.
select is(
  (select array_agg(column_default order by column_name)::text[] from information_schema.columns
    where table_schema = 'public' and table_name = 'tours' and column_name in ('balance_due_days', 'deposit_percent')),
  array['30', '30'],
  'the guard uses the column defaults for deposit and balance terms'
);

-- Editor ------------------------------------------------------------------------------------------
select pg_temp.claims('00000000-0000-4000-8000-000000000414');
set local role authenticated;

insert into public.tours (id, code, type, scope, duration_days, duration_nights, from_price, deposit_percent,
                          balance_due_days, cancellation_policy_id)
values ('40000000-0000-4000-8000-000000000403', 'R-EDITOR', 'private', 'domestic', 2, 1, 99000000, 5, 1,
        '70000000-0000-4000-8000-000000000401');
reset role;
select is(
  (select row(from_price, deposit_percent, balance_due_days)::text from public.tours where code = 'R-EDITOR'),
  row(0::bigint, 30, 30)::text,
  'an editor''s new tour gets no price and the default deposit and balance terms'
);
select is(
  (select cancellation_policy_id from public.tours where code = 'R-EDITOR'),
  (select id from public.cancellation_policies where is_default),
  'an editor''s new tour gets the default cancellation policy'
);
select pg_temp.claims('00000000-0000-4000-8000-000000000414');
set local role authenticated;
select throws_ok(
  $$ update public.tours set from_price = 1 where code = 'R-GROUP' $$,
  '42501', null, 'an editor cannot change a tour price'
);
select throws_ok(
  $$ update public.tours set deposit_percent = 10 where code = 'R-GROUP' $$,
  '42501', null, 'an editor cannot change the deposit'
);
select throws_ok(
  $$ update public.tours set cancellation_policy_id = '70000000-0000-4000-8000-000000000401' where code = 'R-GROUP' $$,
  '42501', null, 'an editor cannot change the cancellation policy'
);
select lives_ok(
  $$ update public.tours set duration_days = 4, duration_nights = 3 where code = 'R-GROUP' $$,
  'an editor can still edit the rest of a tour'
);

-- Operator ----------------------------------------------------------------------------------------
reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000000412');
set local role authenticated;
insert into public.departures (tour_id, start_date, end_date, capacity, price_adult, price_child)
values ('40000000-0000-4000-8000-000000000401', current_date + 60, current_date + 62, 12, 1, 1);
select is(
  (select row(price_adult, price_child)::text from public.departures
    where tour_id = '40000000-0000-4000-8000-000000000401' and start_date = current_date + 60),
  row(9000000::bigint, 7000000::bigint)::text,
  'an operator''s new departure copies the prices of the tour''s latest departure'
);
select throws_ok(
  $$ insert into public.departures (tour_id, start_date, end_date, capacity, price_adult)
     values ('40000000-0000-4000-8000-000000000402', current_date + 10, current_date + 12, 8, 1) $$,
  '42501', null, 'an operator cannot create the first departure of a tour'
);
select throws_ok(
  $$ update public.departures set price_adult = 1 where id = '20000000-0000-4000-8000-000000000401' $$,
  '42501', null, 'an operator cannot change departure prices'
);
select lives_ok(
  $$ update public.departures set capacity = 14, note = 'Thêm 2 chỗ' where id = '20000000-0000-4000-8000-000000000401' $$,
  'an operator can still edit capacity and notes'
);
with d as (delete from public.departures where start_date = current_date + 60 returning 1)
select is(count(*)::int, 1, 'an operator can delete a departure (the guard only covers prices)') from d;

-- Sales manager -----------------------------------------------------------------------------------
reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000000413');
set local role authenticated;
with u as (update public.departures set price_adult = 1 where id = '20000000-0000-4000-8000-000000000401' returning 1)
select is(count(*)::int, 0, 'a sales manager cannot change departure prices (no write access at all)') from u;

-- Admin below aal2 --------------------------------------------------------------------------------
reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000000415', 'aal1');
set local role authenticated;
with u as (update public.tours set from_price = 1 where code = 'R-GROUP' returning 1)
select is(count(*)::int, 0, 'an admin without MFA cannot write tours at all (RLS)') from u;

-- Admin at aal2 -----------------------------------------------------------------------------------
reset role;
select pg_temp.claims('00000000-0000-4000-8000-000000000415', 'aal2');
set local role authenticated;
select lives_ok(
  $$ update public.tours set from_price = 8500000, deposit_percent = 40 where code = 'R-GROUP' $$,
  'an MFA-verified admin sets tour prices'
);
select lives_ok(
  $$ update public.departures set price_adult = 9500000 where id = '20000000-0000-4000-8000-000000000401' $$,
  'an MFA-verified admin sets departure prices'
);
select lives_ok(
  $$ insert into public.departures (tour_id, start_date, end_date, capacity, price_adult)
     values ('40000000-0000-4000-8000-000000000402', current_date + 10, current_date + 12, 8, 30000000) $$,
  'an MFA-verified admin creates a first departure with its own prices'
);
reset role;

-- Publishing --------------------------------------------------------------------------------------
select throws_ok(
  $$ update public.tours set status = 'published' where code = 'R-GROUP' $$,
  '23514', null, 'a tour without a published translation cannot be published'
);
insert into public.tour_translations (tour_id, locale, slug, title, summary, seo_description, is_published) values
  ('40000000-0000-4000-8000-000000000401', 'vi', 'r-group', 'Tour nhóm', 'Tóm tắt', 'Mô tả', true),
  ('40000000-0000-4000-8000-000000000401', 'en', 'r-group-en', 'Group tour', 'Summary', 'Description', true);
select throws_ok(
  $$ update public.tours set status = 'published' where code = 'R-GROUP' $$,
  '23514', null, 'a tour without a hero image cannot be published'
);
select throws_ok(
  $$ update public.tours set status = 'published', hero_media_id = '80000000-0000-4000-8000-000000000402'
     where code = 'R-GROUP' $$,
  '23514', null, 'a hero image without English alt text is refused'
);
select lives_ok(
  $$ update public.tours set status = 'published', hero_media_id = '80000000-0000-4000-8000-000000000401'
     where code = 'R-GROUP' $$,
  'a group tour with a translation, a described hero and a departure is published'
);
select throws_ok(
  $$ update public.tours set hero_media_id = null where code = 'R-GROUP' $$,
  '23514', null, 'a published tour cannot lose its hero image'
);
select throws_ok(
  $$ update public.media set alt = '{"vi": "Thuyền"}' where id = '80000000-0000-4000-8000-000000000401' $$,
  '23514', null, 'the hero of a published tour keeps both alt texts'
);
select lives_ok(
  $$ update public.tour_translations set is_published = false where slug = 'r-group-en' $$,
  'one of two published translations can be unpublished'
);
select throws_ok(
  $$ update public.tour_translations set is_published = false where slug = 'r-group' $$,
  '23514', null, 'the last published translation of a published tour cannot be unpublished'
);
select throws_ok(
  $$ delete from public.tour_translations where slug = 'r-group' $$,
  '23514', null, 'the last published translation of a published tour cannot be deleted'
);
select throws_ok(
  $$ update public.tour_translations set seo_description = '' where slug = 'r-group' $$,
  '23514', null, 'a published translation needs an SEO description'
);
insert into public.tour_translations (tour_id, locale, slug, title, summary, seo_description, is_published) values
  ('40000000-0000-4000-8000-000000000402', 'vi', 'r-private', 'Tour riêng', 'Tóm tắt', 'Mô tả', true);
select throws_ok(
  $$ update public.tours set status = 'published', hero_media_id = '80000000-0000-4000-8000-000000000401'
     where code = 'R-PRIVATE' $$,
  '23514', null, 'a private tour without a price cannot be published'
);
select throws_ok(
  $$ update public.destinations set status = 'published', hero_media_id = '80000000-0000-4000-8000-000000000402'
     where key = 'vietnam' $$,
  '23514', null, 'a published destination needs a hero with both alt texts'
);
select throws_ok(
  $$ insert into public.tours (code, type, scope, duration_days, duration_nights, from_price)
     values ('bad code', 'group', 'domestic', 1, 0, 0) $$,
  '23514', null, 'tour codes are upper-case letters, digits and hyphens'
);

select * from finish();
rollback;
