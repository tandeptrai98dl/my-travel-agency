-- Schema shape: every approved table exists, RLS is enabled everywhere, and the security definer
-- helpers are locked down (docs/DATABASE.md, ARCHITECTURE.md "Security").
begin;
select plan(14);

select tables_are(
  'public',
  array[
    'profiles',
    'media',
    'destinations', 'destination_translations', 'travel_styles', 'travel_style_translations',
    'cancellation_policies', 'tours', 'tour_translations', 'tour_media', 'tour_destinations',
    'tour_travel_styles', 'price_tiers', 'departures',
    'inquiries',
    'bookings', 'booking_items', 'travellers', 'booking_events',
    'payments', 'payment_links', 'webhook_events',
    'internal_notes',
    'reviews', 'post_categories', 'post_category_translations', 'posts', 'post_translations',
    'pages', 'page_translations', 'redirects', 'subscribers',
    'settings', 'consent_records', 'email_logs', 'audit_logs'
  ],
  'the 36 approved tables exist'
);

select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'RLS is enabled on every table in public'
);

select is(
  (
    select array_agg(c.relname::text order by c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
  ),
  null,
  'every table has at least one policy (none is accidentally closed to staff)'
);

select is(
  (
    select array_agg(p.proname::text order by p.proname)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and not coalesce(p.proconfig @> array['search_path=""'], false)
  ),
  null,
  'every security definer function in public sets search_path to empty'
);

select ok(
  not has_function_privilege('anon', 'public.handle_new_user()', 'execute'),
  'anon cannot execute the profile trigger function'
);

select ok(
  has_function_privilege('anon', 'public.can_act_as(public.user_role[])', 'execute'),
  'policy helpers stay executable for anon (policies call them)'
);

select is(
  (
    select array_agg(c.relname::text order by c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (
        has_table_privilege('anon', c.oid, 'insert')
        or has_table_privilege('anon', c.oid, 'update')
        or has_table_privilege('anon', c.oid, 'delete')
        or has_any_column_privilege('anon', c.oid, 'insert')
        or has_any_column_privilege('anon', c.oid, 'update')
      )
  ),
  null,
  'anon has no INSERT, UPDATE or DELETE privilege on any table'
);

select is(
  (
    select array_agg(c.relname::text order by c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (
        has_table_privilege('anon', c.oid, 'truncate')
        or has_table_privilege('authenticated', c.oid, 'truncate')
      )
  ),
  null,
  'no API role can TRUNCATE any table (TRUNCATE bypasses RLS)'
);

-- A table created by a later migration must not get anon write or TRUNCATE privileges either.
create table public.zz_default_privileges_probe (id int);
select ok(
  not has_table_privilege('anon', 'public.zz_default_privileges_probe', 'insert')
    and not has_table_privilege('authenticated', 'public.zz_default_privileges_probe', 'truncate'),
  'default privileges keep anon writes and TRUNCATE closed on new tables'
);

select is(
  (select array_agg(id::text order by id) from storage.buckets where id in ('media', 'media-uploads', 'private')),
  array['media', 'media-uploads', 'private'],
  'the media, media-uploads and private storage buckets exist'
);

select is(
  (select public from storage.buckets where id = 'private'),
  false,
  'the private bucket is not public'
);

select is(
  (select public from storage.buckets where id = 'media-uploads'),
  false,
  'the upload staging bucket is not public'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') || coalesce(with_check, '')) like '%media-uploads%'),
  0,
  'no API-role policy opens the upload staging bucket'
);

select is(
  (select array_agg(cmd::text order by cmd) from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname like 'media bucket:%'),
  array['DELETE', 'SELECT'],
  'staff may only list and delete in the public media bucket'
);

select * from finish();
rollback;
