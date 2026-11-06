-- Public catalog reads (docs/specs/phase-3-public-site.md decision 8, docs/specs/tour-listing.md
-- §1.2–1.5): bookable departures, display price, filters, sorting, published-only rows, grants.
begin;
select plan(20);

insert into public.media (id, path, mime_type, size_bytes, alt) values
  ('80000000-0000-4000-8000-000000000601', '2026/01/80000000-0000-4000-8000-000000000601.jpg',
   'image/jpeg', 1, '{"vi": "Vịnh đá vôi", "en": "Limestone bay"}');

-- Fixtures inserted as drafts, published once complete (publish rules, ADR-024).
insert into public.tours (id, code, type, scope, status, duration_days, duration_nights, from_price, is_featured, hero_media_id) values
  ('40000000-0000-4000-8000-000000000601', 'KT-HLB-01', 'group', 'domestic', 'draft', 3, 2, 1000000, true, '80000000-0000-4000-8000-000000000601'),
  ('40000000-0000-4000-8000-000000000602', 'KT-RIENG-02', 'private', 'domestic', 'draft', 5, 4, 5000000, false, '80000000-0000-4000-8000-000000000601'),
  ('40000000-0000-4000-8000-000000000603', 'KT-NHAP-03', 'group', 'international', 'draft', 9, 8, 0, false, '80000000-0000-4000-8000-000000000601'),
  ('40000000-0000-4000-8000-000000000604', 'KT-VI-04', 'group', 'international', 'draft', 16, 15, 0, false, '80000000-0000-4000-8000-000000000601');
insert into public.tour_translations (tour_id, locale, slug, title, summary, seo_description, is_published) values
  ('40000000-0000-4000-8000-000000000601', 'vi', 'kiem-thu-vinh-ha-long', 'Kiểm thử Vịnh Hạ Long', 'Tóm tắt', 'Mô tả', true),
  ('40000000-0000-4000-8000-000000000601', 'en', 'test-ha-long-bay', 'Test Ha Long Bay', 'Summary', 'Description', true),
  ('40000000-0000-4000-8000-000000000602', 'vi', 'kiem-thu-rieng', 'Kiểm thử riêng', 'Tóm tắt', 'Mô tả', true),
  ('40000000-0000-4000-8000-000000000603', 'vi', 'kiem-thu-nhap', 'Kiểm thử nháp', 'Tóm tắt', 'Mô tả', true),
  ('40000000-0000-4000-8000-000000000604', 'vi', 'kiem-thu-chi-tieng-viet', 'Kiểm thử chỉ tiếng Việt', 'Tóm tắt', 'Mô tả', true),
  ('40000000-0000-4000-8000-000000000604', 'en', 'test-vietnamese-only', 'Test Vietnamese only', 'Summary', 'Description', false);

-- T1: within the cutoff (cheapest), sold out, closed, 3 seats left at +30, cheaper at +75.
insert into public.departures (id, tour_id, start_date, end_date, capacity, seats_reserved, status, price_adult) values
  ('20000000-0000-4000-8000-000000000601', '40000000-0000-4000-8000-000000000601', current_date + 3, current_date + 5, 10, 0, 'open', 1000000),
  ('20000000-0000-4000-8000-000000000602', '40000000-0000-4000-8000-000000000601', current_date + 20, current_date + 22, 10, 10, 'open', 2000000),
  ('20000000-0000-4000-8000-000000000603', '40000000-0000-4000-8000-000000000601', current_date + 25, current_date + 27, 10, 0, 'closed', 3000000),
  ('20000000-0000-4000-8000-000000000604', '40000000-0000-4000-8000-000000000601', current_date + 30, current_date + 32, 10, 7, 'open', 9000000),
  ('20000000-0000-4000-8000-000000000605', '40000000-0000-4000-8000-000000000601', current_date + 75, current_date + 77, 10, 0, 'guaranteed', 8000000),
  ('20000000-0000-4000-8000-000000000606', '40000000-0000-4000-8000-000000000603', current_date + 40, current_date + 48, 10, 0, 'open', 7000000),
  ('20000000-0000-4000-8000-000000000607', '40000000-0000-4000-8000-000000000604', current_date + 40, current_date + 55, 10, 0, 'open', 20000000);

insert into public.tour_travel_styles (tour_id, travel_style_id)
select '40000000-0000-4000-8000-000000000601', id from public.travel_styles where key = 'honeymoon';
insert into public.tour_destinations (tour_id, destination_id)
select '40000000-0000-4000-8000-000000000602', id from public.destinations where key = 'hoi-an';

update public.tours set status = 'published', published_at = now()
where id in ('40000000-0000-4000-8000-000000000601', '40000000-0000-4000-8000-000000000602',
             '40000000-0000-4000-8000-000000000604');

select is(public.immutable_unaccent(lower('Vịnh Hạ Long Đà Lạt')), 'vinh ha long da lat',
  'immutable_unaccent strips Vietnamese diacritics, đ included');
select is(public.booking_cutoff_days(), 7, 'booking cutoff defaults to 7 days');

set local role anon;

select is(
  (select array_agg(s.tour_id order by s.tour_id) from public.search_tours('vi', 'kiem thu') s),
  array['40000000-0000-4000-8000-000000000601', '40000000-0000-4000-8000-000000000602',
        '40000000-0000-4000-8000-000000000604']::uuid[],
  'anon sees published tours with a published translation; the draft is hidden');
select is(
  (select array_agg(s.tour_id) from public.search_tours('en', 'test') s),
  array['40000000-0000-4000-8000-000000000601']::uuid[],
  'an unpublished English translation keeps the tour out of English results');
select results_eq(
  $$ select display_price, price_source, next_departure_date, other_departure_count, seats_left_next
     from public.search_tours('vi', 'KT-HLB-01') $$,
  $$ values (8000000::bigint, 'departure'::text, current_date + 30, 1, 3) $$,
  'within-cutoff, sold-out and closed departures are ignored; next date, seats and price from the rest');
select results_eq(
  $$ select display_price, price_source, next_departure_date, other_departure_count
     from public.search_tours('vi', 'Kiem thu rieng') $$,
  $$ values (5000000::bigint, 'from_price'::text, null::date, 0) $$,
  'a private tour shows from_price and no departure date');
select is(
  (select display_price from public.search_tours('vi', 'KT-HLB-01',
     p_months => array[date_trunc('month', current_date + 30)::date])),
  9000000::bigint,
  'with a month filter the price comes from that month only');
select is(
  (select array_agg(s.tour_id order by s.tour_id) from public.search_tours('vi', 'kiem thu',
     p_months => array[date_trunc('month', current_date + 400)::date]) s),
  array['40000000-0000-4000-8000-000000000602']::uuid[],
  'a month without departures keeps only private tours');
select is(
  (select array_agg(s.tour_id) from public.search_tours('vi', 'kiem thu',
     p_travel_style_ids => (select array_agg(id) from public.travel_styles where key = 'honeymoon')) s),
  array['40000000-0000-4000-8000-000000000601']::uuid[],
  'the travel style filter matches linked tours');
select is(
  (select array_agg(s.tour_id) from public.search_tours('vi', 'kiem thu',
     p_destination_ids => (select array_agg(id) from public.destinations where key = 'hoi-an')) s),
  array['40000000-0000-4000-8000-000000000602']::uuid[],
  'the destination filter matches linked tours');
select is(
  (select array_agg(s.tour_id) from public.search_tours('vi', 'kiem thu', p_scopes => array['international']::public.tour_scope[]) s),
  array['40000000-0000-4000-8000-000000000604']::uuid[],
  'the scope filter works');
select is(
  (select array_agg(s.tour_id) from public.search_tours('vi', 'kiem thu', p_durations => array['15-plus']) s),
  array['40000000-0000-4000-8000-000000000604']::uuid[],
  'the duration buckets work');
select is(
  (select array_agg(s.tour_id order by s.display_price) from public.search_tours('vi', 'kiem thu', p_price_min => 6000000, p_price_max => 10000000) s),
  array['40000000-0000-4000-8000-000000000601']::uuid[],
  'the price range applies to the display price');
select is(
  (select array_agg(s.tour_id) from public.search_tours('vi', 'kiem thu', p_sort => 'price_asc') s),
  array['40000000-0000-4000-8000-000000000602', '40000000-0000-4000-8000-000000000601',
        '40000000-0000-4000-8000-000000000604']::uuid[],
  'price_asc sorts by display price');
select is(
  (select max(total_count) from public.search_tours('vi', 'kiem thu', p_limit => 1)),
  3::bigint,
  'total_count counts every match, not just the page');
select is(
  (select count(*)::int from public.search_tours('vi', '%_')),
  0,
  'LIKE wildcards in the search term are matched literally');
select is(
  (select array_agg(s.tour_id) from public.search_tours('vi', 'kiem thu', p_featured_only => true,
     p_exclude_ids => array['40000000-0000-4000-8000-000000000602']::uuid[]) s),
  array['40000000-0000-4000-8000-000000000601']::uuid[],
  'featured-only and exclusions work (homepage and related tours)');
select results_eq(
  $$ select count(*)::int, count(*) filter (where bookable)::int, min(seats_left)
     from public.tour_departures('40000000-0000-4000-8000-000000000601') $$,
  $$ values (5, 2, 0) $$,
  'tour_departures lists upcoming departures that are not cancelled, with bookability and seats');
select is(
  (select count(*)::int from public.tour_departures('40000000-0000-4000-8000-000000000603')),
  0,
  'anon sees no departures of a draft tour');

reset role;

select ok(
  has_function_privilege('anon', 'public.booking_cutoff_days()', 'execute')
  and not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('search_tours', 'tour_departures', 'immutable_unaccent')
      and p.prosecdef
  ),
  'only booking_cutoff_days is security definer; anon may call it');

select * from finish();
rollback;
