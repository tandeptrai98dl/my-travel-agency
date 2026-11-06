-- Journal and page rules (docs/specs/phase-2-catalog-admin.md step 18): published translations need
-- their text, published posts a described cover, images in published content keep their alt texts,
-- and images referenced inside JSON cannot be deleted.
begin;
select plan(24);

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
  ('00000000-0000-4000-8000-000000000614', 'editor-c@example.test', '{}');
update public.profiles set role = 'editor' where id = '00000000-0000-4000-8000-000000000614';

insert into public.media (id, path, mime_type, size_bytes, alt) values
  ('80000000-0000-4000-8000-000000000601', '2026/01/80000000-0000-4000-8000-000000000601.jpg', 'image/jpeg', 1,
   '{"vi": "Phố cổ", "en": "The old quarter"}'),
  ('80000000-0000-4000-8000-000000000602', '2026/01/80000000-0000-4000-8000-000000000602.jpg', 'image/jpeg', 1,
   '{"vi": "Chỉ tiếng Việt"}'),
  ('80000000-0000-4000-8000-000000000603', '2026/01/80000000-0000-4000-8000-000000000603.jpg', 'image/jpeg', 1,
   '{"vi": "Ngày một", "en": "Day one"}'),
  ('80000000-0000-4000-8000-000000000604', '2026/01/80000000-0000-4000-8000-000000000604.jpg', 'image/jpeg', 1,
   '{"vi": "Chưa dùng", "en": "Unused"}');

create function pg_temp.doc(media uuid default null)
returns jsonb
language sql
as $$
  select jsonb_build_object('type', 'doc', 'content',
    jsonb_build_array(jsonb_build_object('type', 'paragraph', 'content',
      jsonb_build_array(jsonb_build_object('type', 'text', 'text', 'Một buổi sáng ở Hội An.'))))
    || case when media is null then '[]'::jsonb
            else jsonb_build_array(jsonb_build_object('type', 'image', 'attrs', jsonb_build_object('mediaId', media))) end)
$$;

-- Helpers ------------------------------------------------------------------------------------------
select is(
  public.rich_text_media_ids(pg_temp.doc('80000000-0000-4000-8000-000000000601')),
  array['80000000-0000-4000-8000-000000000601']::uuid[],
  'image ids are read from rich text'
);
select ok(public.rich_text_is_empty('{"type": "doc", "content": [{"type": "paragraph"}]}'), 'an empty editor counts as empty');
select ok(
  public.rich_text_is_empty('{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "  "}]}]}'),
  'spaces count as empty'
);
select ok(not public.rich_text_is_empty(pg_temp.doc()), 'text is content');

-- Editor: translations ---------------------------------------------------------------------------------
select pg_temp.claims('00000000-0000-4000-8000-000000000614');
set local role authenticated;
insert into public.posts (id, status) values
  ('50000000-0000-4000-8000-000000000601', 'draft'),
  ('50000000-0000-4000-8000-000000000602', 'draft');
select throws_ok(
  $$ insert into public.post_translations (post_id, locale, slug, title, content, seo_description, is_published)
     values ('50000000-0000-4000-8000-000000000601', 'vi', 'pho-co', 'Phố cổ',
             '{"type": "doc", "content": [{"type": "paragraph"}]}', 'Mô tả', true) $$,
  '23514', null, 'a published translation needs content'
);
select throws_ok(
  $$ insert into public.post_translations (post_id, locale, slug, title, content, is_published)
     values ('50000000-0000-4000-8000-000000000601', 'vi', 'pho-co', 'Phố cổ', pg_temp.doc(), true) $$,
  '23514', null, 'a published translation needs an SEO description'
);
select throws_ok(
  $$ insert into public.post_translations (post_id, locale, slug, title, content, seo_description, is_published)
     values ('50000000-0000-4000-8000-000000000601', 'vi', 'pho-co', 'Phố cổ',
             pg_temp.doc('80000000-0000-4000-8000-000000000602'), 'Mô tả', true) $$,
  '23514', 'images in published content need Vietnamese and English alt text',
  'images in a published translation need both alt texts'
);
select lives_ok(
  $$ insert into public.post_translations (post_id, locale, slug, title, content, seo_description, is_published)
     values ('50000000-0000-4000-8000-000000000601', 'vi', 'pho-co', 'Phố cổ',
             pg_temp.doc('80000000-0000-4000-8000-000000000601'), 'Mô tả', true),
            ('50000000-0000-4000-8000-000000000601', 'en', 'old-quarter', 'Old quarter',
             pg_temp.doc('80000000-0000-4000-8000-000000000602'), null, false) $$,
  'a complete translation is published; a draft language may hold anything'
);

-- Editor: publishing the post -------------------------------------------------------------------------
select throws_ok(
  $$ update public.posts set status = 'published' where id = '50000000-0000-4000-8000-000000000601' $$,
  '23514', null, 'a published article needs a cover'
);
select throws_ok(
  $$ update public.posts set status = 'published', cover_media_id = '80000000-0000-4000-8000-000000000602'
     where id = '50000000-0000-4000-8000-000000000601' $$,
  '23514', null, 'the cover needs both alt texts'
);
select lives_ok(
  $$ update public.posts set status = 'published', cover_media_id = '80000000-0000-4000-8000-000000000603'
     where id = '50000000-0000-4000-8000-000000000601' $$,
  'an article with a published translation and a described cover is published'
);
select throws_ok(
  $$ update public.posts set status = 'published' where id = '50000000-0000-4000-8000-000000000602' $$,
  '23514', null, 'an article without a published translation cannot be published'
);
select throws_ok(
  $$ update public.post_translations set is_published = false where slug = 'pho-co' $$,
  '23514', null, 'a published article keeps its last published translation'
);
select throws_ok(
  $$ delete from public.post_translations where slug = 'pho-co' $$,
  '23514', null, 'the last published translation of a published article cannot be deleted'
);
select throws_ok(
  $$ update public.post_translations set post_id = '50000000-0000-4000-8000-000000000602' where slug = 'old-quarter' $$,
  '23514', null, 'a translation cannot move to another article'
);
select throws_ok(
  $$ update public.media set alt = '{"vi": "Phố cổ"}' where id = '80000000-0000-4000-8000-000000000601' $$,
  '23514', null, 'an image inside published content keeps both alt texts'
);
select throws_ok(
  $$ update public.media set alt = '{"vi": "Ngày một"}' where id = '80000000-0000-4000-8000-000000000603' $$,
  '23514', null, 'the cover of a published article keeps both alt texts'
);

-- Editor: pages -------------------------------------------------------------------------------------------
insert into public.pages (id, key) values ('60000000-0000-4000-8000-000000000601', 'test-terms');
select throws_ok(
  $$ update public.pages set status = 'published' where id = '60000000-0000-4000-8000-000000000601' $$,
  '23514', null, 'a page without a published translation cannot be published'
);
insert into public.page_translations (page_id, locale, slug, title, content, seo_description, is_published) values
  ('60000000-0000-4000-8000-000000000601', 'vi', 'dieu-khoan-thu', 'Điều khoản', pg_temp.doc(), 'Mô tả', true);
select lives_ok(
  $$ update public.pages set status = 'published' where id = '60000000-0000-4000-8000-000000000601' $$,
  'a page with a published translation is published'
);

-- Media used inside JSON ----------------------------------------------------------------------------------
reset role;
insert into public.tours (id, code, type, scope, duration_days, duration_nights, from_price) values
  ('40000000-0000-4000-8000-000000000601', 'C-TOUR', 'group', 'domestic', 2, 1, 0);
insert into public.tour_translations (tour_id, locale, slug, title, summary, itinerary) values
  ('40000000-0000-4000-8000-000000000601', 'vi', 'c-tour', 'Tour', 'Tóm tắt',
   '[{"day": 1, "title": "Ngày 1", "media_ids": ["80000000-0000-4000-8000-000000000603"]}]');
select pg_temp.claims('00000000-0000-4000-8000-000000000614');
set local role authenticated;
select throws_ok(
  $$ delete from public.media where id = '80000000-0000-4000-8000-000000000602' $$,
  '23503', 'this image is used in content', 'an image inside a draft translation cannot be deleted'
);
-- The cover is a foreign key; the itinerary reference is the JSON one. Detach the cover first.
reset role;
update public.posts set status = 'draft' where id = '50000000-0000-4000-8000-000000000601';
update public.posts set cover_media_id = null where id = '50000000-0000-4000-8000-000000000601';
select pg_temp.claims('00000000-0000-4000-8000-000000000614');
set local role authenticated;
select throws_ok(
  $$ delete from public.media where id = '80000000-0000-4000-8000-000000000603' $$,
  '23503', 'this image is used in content', 'an image in a tour itinerary cannot be deleted'
);
with d as (delete from public.media where id = '80000000-0000-4000-8000-000000000604' returning 1)
select is(count(*)::int, 1, 'an unused image can be deleted') from d;
reset role;

select ok(
  not has_function_privilege('anon', 'public.media_used_in_content(uuid)', 'execute'),
  'anon cannot call the media usage helper'
);
select ok(
  has_function_privilege('anon', 'public.rich_text_is_empty(jsonb)', 'execute'),
  'the pure rich text helpers stay callable (public pages may use them)'
);

select * from finish();
rollback;
