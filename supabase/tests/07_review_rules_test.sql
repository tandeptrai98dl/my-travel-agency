-- Review moderation (docs/specs/phase-2-catalog-admin.md step 19).
begin;
select plan(9);

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
  ('00000000-0000-4000-8000-000000000714', 'editor-r7@example.test', '{}'),
  ('00000000-0000-4000-8000-000000000712', 'operator-r7@example.test', '{}');
update public.profiles set role = 'editor' where id = '00000000-0000-4000-8000-000000000714';
update public.profiles set role = 'operator' where id = '00000000-0000-4000-8000-000000000712';

insert into public.reviews (id, author_name, rating, content, locale, is_verified) values
  ('90000000-0000-4000-8000-000000000701', 'Lan', 5, 'Chuyến đi tuyệt vời.', 'vi', true);

select pg_temp.claims('00000000-0000-4000-8000-000000000714');
set local role authenticated;
select lives_ok(
  $$ update public.reviews set status = 'approved', is_featured = true where id = '90000000-0000-4000-8000-000000000701' $$,
  'an editor approves and features a review'
);
select throws_ok(
  $$ update public.reviews set status = 'rejected' where id = '90000000-0000-4000-8000-000000000701' $$,
  '23514', null, 'a featured review cannot be rejected while featured'
);
select throws_ok(
  $$ update public.reviews set content = 'Đã sửa' where id = '90000000-0000-4000-8000-000000000701' $$,
  '42501', null, 'staff cannot edit what the customer wrote'
);
select throws_ok(
  $$ update public.reviews set is_verified = false where id = '90000000-0000-4000-8000-000000000701' $$,
  '42501', null, 'staff cannot change the verified flag'
);
insert into public.reviews (id, author_name, rating, content, locale, is_verified)
values ('90000000-0000-4000-8000-000000000702', 'Minh', 4, 'Đẹp.', 'vi', true);
reset role;
select is(
  (select is_verified from public.reviews where id = '90000000-0000-4000-8000-000000000702'),
  false,
  'a review written in by staff is never verified'
);
select throws_ok(
  $$ insert into public.reviews (author_name, rating, content, locale, status, is_featured)
     values ('X', 5, 'Y', 'vi', 'pending', true) $$,
  '23514', null, 'a pending review cannot be featured'
);

select pg_temp.claims('00000000-0000-4000-8000-000000000712');
set local role authenticated;
with u as (update public.reviews set status = 'rejected' where id = '90000000-0000-4000-8000-000000000702' returning 1)
select is(count(*)::int, 0, 'an operator cannot moderate reviews (RLS)') from u;
select is(
  (select count(*)::int from public.reviews where id = '90000000-0000-4000-8000-000000000701'),
  1,
  'staff read every review'
);
reset role;
set local role anon;
select is(
  (select count(*)::int from public.reviews where id = '90000000-0000-4000-8000-000000000702'),
  0,
  'visitors see approved reviews only'
);
reset role;

select * from finish();
rollback;
