-- The homepage hero keeps its alt texts and cannot be deleted while used (PR 20 review, ADR-032).
begin;
select plan(5);

create function pg_temp.claims(uid uuid, aal text default 'aal1')
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000001214', 'editor-home@example.test', '{}');
update public.profiles set role = 'editor' where id = '00000000-0000-4000-8000-000000001214';
insert into public.media (id, path, mime_type, size_bytes, alt) values
  ('80000000-0000-4000-8000-0000000012aa', '2026/01/80000000-0000-4000-8000-0000000012aa.jpg', 'image/jpeg', 1,
   '{"vi": "Bình minh trên vịnh", "en": "Dawn over the bay"}');
update public.settings
   set value = jsonb_set(value, '{hero,media_id}', '"80000000-0000-4000-8000-0000000012AA"')
 where key = 'homepage';

select ok(public.is_homepage_hero('80000000-0000-4000-8000-0000000012aa'), 'the hero id is matched in any letter case');

select pg_temp.claims('00000000-0000-4000-8000-000000001214');
set local role authenticated;
select ok(public.media_used_in_content('80000000-0000-4000-8000-0000000012aa'), 'the media library sees the homepage hero as in use');
select throws_ok(
  $$ update public.media set alt = '{"vi": "Bình minh trên vịnh"}' where id = '80000000-0000-4000-8000-0000000012aa' $$,
  '23514', null, 'an editor cannot clear an alt text of the homepage hero'
);
select throws_ok(
  $$ delete from public.media where id = '80000000-0000-4000-8000-0000000012aa' $$,
  '23503', null, 'an editor cannot delete the homepage hero'
);
reset role;

update public.settings set value = value #- '{hero,media_id}' where key = 'homepage';
select pg_temp.claims('00000000-0000-4000-8000-000000001214');
set local role authenticated;
select lives_ok(
  $$ update public.media set alt = '{"vi": "Bình minh trên vịnh"}' where id = '80000000-0000-4000-8000-0000000012aa' $$,
  'once the homepage uses another image the alt text may change'
);
reset role;

select * from finish();
rollback;
