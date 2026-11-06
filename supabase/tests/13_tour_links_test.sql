-- set_tour_links(): a tour's gallery, destinations and travel styles in one transaction
-- (Phase 2 polish, *_tour_links_function.sql).
begin;
select plan(10);

create function pg_temp.claims(uid uuid, aal text default 'aal1')
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000001314', 'editor-links@example.test', '{}'),
  ('00000000-0000-4000-8000-000000001312', 'operator-links@example.test', '{}');
update public.profiles set role = 'editor' where id = '00000000-0000-4000-8000-000000001314';
update public.profiles set role = 'operator' where id = '00000000-0000-4000-8000-000000001312';
insert into public.media (id, path, mime_type, size_bytes, alt) values
  ('80000000-0000-4000-8000-000000001301', '2026/01/80000000-0000-4000-8000-000000001301.jpg', 'image/jpeg', 1, '{}'),
  ('80000000-0000-4000-8000-000000001302', '2026/01/80000000-0000-4000-8000-000000001302.jpg', 'image/jpeg', 1, '{}'),
  ('80000000-0000-4000-8000-000000001303', '2026/01/80000000-0000-4000-8000-000000001303.jpg', 'image/jpeg', 1, '{}');
insert into public.tours (id, code, type, scope, duration_days, duration_nights, from_price) values
  ('40000000-0000-4000-8000-000000001301', 'L-LINKS', 'private', 'domestic', 2, 1, 0);

create function pg_temp.links()
returns text
language sql
as $$
  select concat_ws(' | ',
    (select string_agg(right(media_id::text, 4), ',' order by sort_order) from public.tour_media
      where tour_id = '40000000-0000-4000-8000-000000001301'),
    (select string_agg(d.key, ',' order by d.key) from public.tour_destinations td join public.destinations d on d.id = td.destination_id
      where td.tour_id = '40000000-0000-4000-8000-000000001301'),
    (select string_agg(s.key, ',' order by s.key) from public.tour_travel_styles ts join public.travel_styles s on s.id = ts.travel_style_id
      where ts.tour_id = '40000000-0000-4000-8000-000000001301'))
$$;

select pg_temp.claims('00000000-0000-4000-8000-000000001314');
set local role authenticated;
select lives_ok(
  $$ select public.set_tour_links('40000000-0000-4000-8000-000000001301',
       array['80000000-0000-4000-8000-000000001302', '80000000-0000-4000-8000-000000001301']::uuid[],
       array(select id from public.destinations where key in ('vietnam', 'japan')),
       array(select id from public.travel_styles order by key limit 1)) $$,
  'an editor sets the links of a tour'
);
reset role;
select is(
  pg_temp.links(),
  '1302,1301 | japan,vietnam | ' || (select key from public.travel_styles order by key limit 1),
  'the gallery keeps the given order; destinations and styles are set'
);

select pg_temp.claims('00000000-0000-4000-8000-000000001314');
set local role authenticated;
select lives_ok(
  $$ select public.set_tour_links('40000000-0000-4000-8000-000000001301',
       array['80000000-0000-4000-8000-000000001301', '80000000-0000-4000-8000-000000001303']::uuid[],
       array(select id from public.destinations where key = 'vietnam'), '{}') $$,
  'reorder, add and remove in one call'
);
reset role;
select is(pg_temp.links(), '1301,1303 | vietnam', 'removed links are gone, the rest reordered');

-- A failure partway leaves everything as it was: the gallery change before the bad destination
-- is rolled back with it.
select pg_temp.claims('00000000-0000-4000-8000-000000001314');
set local role authenticated;
select throws_ok(
  $$ select public.set_tour_links('40000000-0000-4000-8000-000000001301',
       array['80000000-0000-4000-8000-000000001302']::uuid[],
       array['00000000-0000-4000-8000-00000000dead']::uuid[], '{}') $$,
  '23503', null, 'an unknown destination fails the whole call'
);
reset role;
select is(pg_temp.links(), '1301,1303 | vietnam', 'nothing of the failed call was applied');

-- RLS still applies (security invoker): operators cannot change tour links.
select pg_temp.claims('00000000-0000-4000-8000-000000001312');
set local role authenticated;
select throws_ok(
  $$ select public.set_tour_links('40000000-0000-4000-8000-000000001301',
       array['80000000-0000-4000-8000-000000001302']::uuid[], array(select id from public.destinations where key = 'japan'), '{}') $$,
  '42501', null, 'an operator cannot write tour links'
);
-- Removals by an operator are filtered out by RLS (no row to delete), so nothing changes either.
select lives_ok(
  $$ select public.set_tour_links('40000000-0000-4000-8000-000000001301', '{}', '{}', '{}') $$,
  'an operator asking to clear the links changes nothing'
);
reset role;
select is(pg_temp.links(), '1301,1303 | vietnam', 'the links survive the operator calls');

select ok(
  not has_function_privilege('anon', 'public.set_tour_links(uuid, uuid[], uuid[], uuid[])', 'execute'),
  'anon cannot call set_tour_links'
);

select * from finish();
rollback;
