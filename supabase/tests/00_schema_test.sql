-- Schema shape: every approved table exists, RLS is enabled everywhere, and the security definer
-- helpers are locked down (docs/DATABASE.md, ARCHITECTURE.md "Security").
begin;
select plan(10);

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

select ok(
  not has_table_privilege('anon', 'public.bookings', 'insert'),
  'anon has no INSERT privilege on bookings'
);

select ok(
  not has_table_privilege('authenticated', 'public.payments', 'truncate'),
  'authenticated cannot TRUNCATE (which would bypass RLS)'
);

select is(
  (select array_agg(id::text order by id) from storage.buckets where id in ('media', 'private')),
  array['media', 'private'],
  'the media and private storage buckets exist'
);

select is(
  (select public from storage.buckets where id = 'private'),
  false,
  'the private bucket is not public'
);

select * from finish();
rollback;
