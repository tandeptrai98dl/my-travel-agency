-- Site search (docs/specs/phase-3-public-site.md step 18): destinations and journal articles in one
-- language, diacritic-insensitive, published only, LIKE wildcards taken literally, grants.
begin;
select plan(12);

insert into public.media (id, path, mime_type, size_bytes, alt) values
  ('80000000-0000-4000-8000-000000003201', '2026/01/80000000-0000-4000-8000-000000003201.jpg',
   'image/jpeg', 1, '{"vi": "Đồi chè", "en": "Tea hills"}');

-- Destinations: one published in both languages, one draft, one with an unpublished English text.
insert into public.destinations (id, key, type, status) values
  ('70000000-0000-4000-8000-000000003201', 'kiem-thu-doi-che', 'country', 'draft'),
  ('70000000-0000-4000-8000-000000003202', 'kiem-thu-nhap', 'country', 'draft'),
  ('70000000-0000-4000-8000-000000003203', 'kiem-thu-chi-viet', 'country', 'draft');
insert into public.destination_translations (destination_id, locale, slug, name, summary, is_published) values
  ('70000000-0000-4000-8000-000000003201', 'vi', 'kiem-thu-doi-che', 'Zqx đồi chè Mộc Châu', 'Đồi chè xanh.', true),
  ('70000000-0000-4000-8000-000000003201', 'en', 'test-tea-hills', 'Zqx tea hills', 'Green tea hills.', true),
  ('70000000-0000-4000-8000-000000003202', 'vi', 'kiem-thu-nhap', 'Zqx bản nháp', 'Chưa đăng.', true),
  ('70000000-0000-4000-8000-000000003203', 'vi', 'kiem-thu-chi-viet', 'Zqx chỉ tiếng Việt', 'Chỉ có tiếng Việt, có 100% và dấu _.', true),
  ('70000000-0000-4000-8000-000000003203', 'en', 'test-vietnamese-only', 'Zqx Vietnamese only', 'Not published.', false);
update public.destinations set status = 'published'
where id in ('70000000-0000-4000-8000-000000003201', '70000000-0000-4000-8000-000000003203');

-- Articles: one published, one draft, one scheduled for tomorrow.
insert into public.posts (id, status, cover_media_id) values
  ('50000000-0000-4000-8000-000000003201', 'draft', '80000000-0000-4000-8000-000000003201'),
  ('50000000-0000-4000-8000-000000003202', 'draft', '80000000-0000-4000-8000-000000003201'),
  ('50000000-0000-4000-8000-000000003203', 'draft', '80000000-0000-4000-8000-000000003201');
insert into public.post_translations (post_id, locale, slug, title, excerpt, content, seo_description, is_published) values
  ('50000000-0000-4000-8000-000000003201', 'vi', 'kiem-thu-mua-che', 'Mùa hái chè Zqx', 'Sáng sớm trên đồi.',
   '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Chè."}]}]}', 'Mô tả', true),
  ('50000000-0000-4000-8000-000000003202', 'vi', 'kiem-thu-bai-nhap', 'Bài nháp Zqx', null,
   '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Nháp."}]}]}', 'Mô tả', true),
  ('50000000-0000-4000-8000-000000003203', 'vi', 'kiem-thu-hen-gio', 'Bài hẹn giờ Zqx', null,
   '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Hẹn giờ."}]}]}', 'Mô tả', true);
update public.posts set status = 'published', published_at = now() - interval '1 day' where id = '50000000-0000-4000-8000-000000003201';
update public.posts set status = 'published', published_at = now() + interval '1 day' where id = '50000000-0000-4000-8000-000000003203';

set local role anon;

select results_eq(
  $$ select kind, title from public.search_site('vi', 'zqx doi che') $$,
  $$ values ('destination'::text, 'Zqx đồi chè Mộc Châu'::text) $$,
  'a term without diacritics finds a destination name with them (đ included)'
);
select results_eq(
  $$ select kind, title from public.search_site('vi', 'ZQX') order by kind, title $$,
  $$ values ('destination'::text, 'Zqx chỉ tiếng Việt'::text), ('destination', 'Zqx đồi chè Mộc Châu'), ('post', 'Mùa hái chè Zqx') $$,
  'only published destinations and articles, in any letter case'
);
select results_eq(
  $$ select kind, title from public.search_site('en', 'zqx') order by kind, title $$,
  $$ values ('destination'::text, 'Zqx tea hills'::text) $$,
  'English finds only published English translations'
);
select is(
  (select title from public.search_site('vi', 'sáng sớm trên đồi')),
  'Mùa hái chè Zqx',
  'an article is found by its excerpt'
);
select is(
  (select count(*)::int from public.search_site('vi', 'xanh') where title like 'Zqx%'),
  1,
  'a destination is found by its summary'
);
select is((select count(*)::int from public.search_site('vi', '%')), 0, 'a lone % is too short and finds nothing');
select is((select count(*)::int from public.search_site('vi', '%%')), 0, '% is taken literally, not as a wildcard');
select is(
  (select title from public.search_site('vi', '100%')),
  'Zqx chỉ tiếng Việt',
  'a % in the term matches a % in the text'
);
select is((select count(*)::int from public.search_site('vi', '_ _')), 0, '_ is taken literally');
select is((select count(*)::int from public.search_site('vi', 'z')), 0, 'one character is ignored');
select is(
  (select count(*)::int from public.search_site('vi', 'zqx', 1)),
  2,
  'the limit applies to each kind'
);

reset role;
select ok(
  not has_function_privilege('public', 'public.search_site(public.locale, text, int)', 'execute')
    and has_function_privilege('anon', 'public.search_site(public.locale, text, int)', 'execute')
    and (select prosecdef = false from pg_proc where oid = 'public.search_site(public.locale, text, int)'::regprocedure),
  'search_site is security invoker and executable by anon, not by public'
);

select * from finish();
rollback;
