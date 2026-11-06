-- Baseline Row Level Security (ADR-004, ADR-009; docs/DATABASE.md "RLS policy summary" and the
-- permission matrix in docs/ARCHITECTURE.md).
--
-- Rules of thumb used below:
--   * RLS is enabled on every table. A table without a policy for a role is closed to that role.
--   * Staff checks go through public.can_act_as(), which also enforces MFA (aal2) for admin and
--     accountant. Helper calls are wrapped in (select ...) so Postgres evaluates them once.
--   * Guest writes (draft bookings, inquiries, newsletter) and every write to payments,
--     payment_links, webhook_events, consent_records, email_logs and audit_logs go through the
--     service role, which bypasses RLS. No anon INSERT policy exists anywhere.

-- Enable RLS on all 36 tables -----------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.media enable row level security;
alter table public.destinations enable row level security;
alter table public.destination_translations enable row level security;
alter table public.travel_styles enable row level security;
alter table public.travel_style_translations enable row level security;
alter table public.cancellation_policies enable row level security;
alter table public.tours enable row level security;
alter table public.tour_translations enable row level security;
alter table public.tour_media enable row level security;
alter table public.tour_destinations enable row level security;
alter table public.tour_travel_styles enable row level security;
alter table public.price_tiers enable row level security;
alter table public.departures enable row level security;
alter table public.inquiries enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_items enable row level security;
alter table public.travellers enable row level security;
alter table public.booking_events enable row level security;
alter table public.payments enable row level security;
alter table public.payment_links enable row level security;
alter table public.webhook_events enable row level security;
alter table public.internal_notes enable row level security;
alter table public.reviews enable row level security;
alter table public.post_categories enable row level security;
alter table public.post_category_translations enable row level security;
alter table public.posts enable row level security;
alter table public.post_translations enable row level security;
alter table public.pages enable row level security;
alter table public.page_translations enable row level security;
alter table public.redirects enable row level security;
alter table public.subscribers enable row level security;
alter table public.settings enable row level security;
alter table public.consent_records enable row level security;
alter table public.email_logs enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles ------------------------------------------------------------------------------------
-- Customers read and update their own row; guard_profile_update() blocks role, is_active,
-- deleted_at and email changes by anyone but an MFA-verified admin. No INSERT or DELETE policy:
-- rows come from the auth trigger and are soft-deleted.
create policy "profiles: read own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: staff read" on public.profiles
  for select to authenticated
  using ((select public.can_act_as('{sales,sales_manager,operator,accountant,admin}')));

create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "profiles: admin update" on public.profiles
  for update to authenticated
  using ((select public.can_act_as('{admin}')))
  with check ((select public.can_act_as('{admin}')));

-- Published content: public read, staff read all ------------------------------------------------
-- Media rows describe files in the public `media` bucket, so they are readable by everyone.
create policy "media: public read" on public.media
  for select to anon, authenticated
  using (true);

create policy "destinations: public read published" on public.destinations
  for select to anon, authenticated
  using (status = 'published');

create policy "destination_translations: public read published" on public.destination_translations
  for select to anon, authenticated
  using (
    is_published
    and exists (
      select 1 from public.destinations d
      where d.id = destination_id and d.status = 'published'
    )
  );

create policy "travel_styles: public read published" on public.travel_styles
  for select to anon, authenticated
  using (status = 'published');

create policy "travel_style_translations: public read published" on public.travel_style_translations
  for select to anon, authenticated
  using (
    is_published
    and exists (
      select 1 from public.travel_styles s
      where s.id = travel_style_id and s.status = 'published'
    )
  );

-- Cancellation policies are shown at checkout and in policy pages.
create policy "cancellation_policies: public read" on public.cancellation_policies
  for select to anon, authenticated
  using (true);

create policy "tours: public read published" on public.tours
  for select to anon, authenticated
  using (status = 'published');

create policy "tour_translations: public read published" on public.tour_translations
  for select to anon, authenticated
  using (
    is_published
    and exists (select 1 from public.tours t where t.id = tour_id and t.status = 'published')
  );

create policy "tour_media: public read published" on public.tour_media
  for select to anon, authenticated
  using (exists (select 1 from public.tours t where t.id = tour_id and t.status = 'published'));

create policy "tour_destinations: public read published" on public.tour_destinations
  for select to anon, authenticated
  using (exists (select 1 from public.tours t where t.id = tour_id and t.status = 'published'));

create policy "tour_travel_styles: public read published" on public.tour_travel_styles
  for select to anon, authenticated
  using (exists (select 1 from public.tours t where t.id = tour_id and t.status = 'published'));

create policy "price_tiers: public read published" on public.price_tiers
  for select to anon, authenticated
  using (exists (select 1 from public.tours t where t.id = tour_id and t.status = 'published'));

create policy "departures: public read published" on public.departures
  for select to anon, authenticated
  using (exists (select 1 from public.tours t where t.id = tour_id and t.status = 'published'));

create policy "post_categories: public read" on public.post_categories
  for select to anon, authenticated
  using (true);

create policy "post_category_translations: public read" on public.post_category_translations
  for select to anon, authenticated
  using (true);

create policy "posts: public read published" on public.posts
  for select to anon, authenticated
  using (status = 'published');

create policy "post_translations: public read published" on public.post_translations
  for select to anon, authenticated
  using (
    is_published
    and exists (select 1 from public.posts p where p.id = post_id and p.status = 'published')
  );

create policy "pages: public read published" on public.pages
  for select to anon, authenticated
  using (status = 'published');

create policy "page_translations: public read published" on public.page_translations
  for select to anon, authenticated
  using (
    is_published
    and exists (select 1 from public.pages p where p.id = page_id and p.status = 'published')
  );

create policy "reviews: public read approved" on public.reviews
  for select to anon, authenticated
  using (status = 'approved');

create policy "settings: public read public keys" on public.settings
  for select to anon, authenticated
  using (is_public);

-- Staff read on catalog and content tables (every staff role; MFA for admin/accountant).
do $$
declare
  t text;
begin
  foreach t in array array[
    'media', 'destinations', 'destination_translations', 'travel_styles',
    'travel_style_translations', 'cancellation_policies', 'tours', 'tour_translations',
    'tour_media', 'tour_destinations', 'tour_travel_styles', 'price_tiers', 'departures',
    'post_categories', 'post_category_translations', 'posts', 'post_translations', 'pages',
    'page_translations', 'reviews', 'settings'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated '
      'using ((select public.can_act_as(%L)))',
      t || ': staff read', t, '{sales,sales_manager,operator,accountant,editor,admin}'
    );
  end loop;
end;
$$;

-- Staff writes on catalog and content ----------------------------------------------------------
-- Generates insert/update/delete policies for the given roles on each table.
create function pg_temp.staff_write_policies(tables text[], roles text)
returns void
language plpgsql
as $$
declare
  t text;
begin
  foreach t in array tables loop
    execute format(
      'create policy %I on public.%I for insert to authenticated '
      'with check ((select public.can_act_as(%L)))', t || ': staff insert', t, roles);
    execute format(
      'create policy %I on public.%I for update to authenticated '
      'using ((select public.can_act_as(%L))) with check ((select public.can_act_as(%L)))',
      t || ': staff update', t, roles, roles);
    execute format(
      'create policy %I on public.%I for delete to authenticated '
      'using ((select public.can_act_as(%L)))', t || ': staff delete', t, roles);
  end loop;
end;
$$;

-- Tour content: editor and admin. Price columns on tours are not yet restricted per column
-- (Phase 2 adds that guard together with the tour editor).
select pg_temp.staff_write_policies(
  array['tours', 'tour_translations', 'tour_media', 'tour_destinations', 'tour_travel_styles'],
  '{editor,admin}');

-- Departures and seats: operator and admin. Departure price edits by operator are restricted in
-- Phase 2; whether sales_manager may edit prices is pending (ADR-016).
select pg_temp.staff_write_policies(array['departures'], '{operator,admin}');

-- Prices and cancellation rules: admin only (ADR-016 pending decision keeps sales_manager out).
select pg_temp.staff_write_policies(array['price_tiers', 'cancellation_policies'], '{admin}');

-- Destinations, styles, journal, pages, reviews, media, redirects, newsletter: editor and admin.
select pg_temp.staff_write_policies(
  array[
    'media', 'destinations', 'destination_translations', 'travel_styles',
    'travel_style_translations', 'post_categories', 'post_category_translations', 'posts',
    'post_translations', 'pages', 'page_translations', 'reviews', 'redirects', 'subscribers'
  ],
  '{editor,admin}');

-- Settings: admin only.
select pg_temp.staff_write_policies(array['settings'], '{admin}');

create policy "redirects: staff read" on public.redirects
  for select to authenticated
  using ((select public.can_act_as('{editor,admin}')));

create policy "subscribers: staff read" on public.subscribers
  for select to authenticated
  using ((select public.can_act_as('{editor,admin}')));

-- Inquiries and internal notes -----------------------------------------------------------------
-- Sales roles see and edit leads assigned to them or unassigned; admin sees all; operator reads.
create policy "inquiries: sales read assigned or unassigned" on public.inquiries
  for select to authenticated
  using (
    (select public.can_act_as('{sales,sales_manager}'))
    and (assigned_to is null or assigned_to = (select auth.uid()))
  );

create policy "inquiries: admin and operator read" on public.inquiries
  for select to authenticated
  using ((select public.can_act_as('{operator,admin}')));

create policy "inquiries: staff insert" on public.inquiries
  for insert to authenticated
  with check ((select public.can_act_as('{sales,sales_manager,admin}')));

create policy "inquiries: sales update assigned or unassigned" on public.inquiries
  for update to authenticated
  using (
    (select public.can_act_as('{sales,sales_manager}'))
    and (assigned_to is null or assigned_to = (select auth.uid()))
  )
  with check (
    (select public.can_act_as('{sales,sales_manager}'))
    and (assigned_to is null or assigned_to = (select auth.uid()))
  );

create policy "inquiries: admin update" on public.inquiries
  for update to authenticated
  using ((select public.can_act_as('{admin}')))
  with check ((select public.can_act_as('{admin}')));

create policy "inquiries: admin delete" on public.inquiries
  for delete to authenticated
  using ((select public.can_act_as('{admin}')));

create policy "internal_notes: staff read" on public.internal_notes
  for select to authenticated
  using ((select public.can_act_as('{sales,sales_manager,operator,admin}')));

create policy "internal_notes: staff insert own" on public.internal_notes
  for insert to authenticated
  with check (
    (select public.can_act_as('{sales,sales_manager,admin}'))
    and author_id = (select auth.uid())
  );

create policy "internal_notes: admin delete" on public.internal_notes
  for delete to authenticated
  using ((select public.can_act_as('{admin}')));

-- Bookings ------------------------------------------------------------------------------------
-- Customers read their own bookings. Seat and money changes run in service-role Postgres
-- functions (ADR-012); the staff policies below cover reads and non-financial edits.
create policy "bookings: customer read own" on public.bookings
  for select to authenticated
  using (customer_id = (select auth.uid()));

create policy "bookings: staff read" on public.bookings
  for select to authenticated
  using ((select public.can_act_as('{sales,sales_manager,operator,accountant,admin}')));

create policy "bookings: staff insert" on public.bookings
  for insert to authenticated
  with check ((select public.can_act_as('{sales,sales_manager,admin}')));

create policy "bookings: staff update" on public.bookings
  for update to authenticated
  using ((select public.can_act_as('{sales,sales_manager,operator,admin}')))
  with check ((select public.can_act_as('{sales,sales_manager,operator,admin}')));

create policy "booking_items: customer read own" on public.booking_items
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.customer_id = (select auth.uid())
    )
  );

create policy "booking_items: staff read" on public.booking_items
  for select to authenticated
  using ((select public.can_act_as('{sales,sales_manager,operator,accountant,admin}')));

select pg_temp.staff_write_policies(array['booking_items'], '{sales,sales_manager,admin}');

create policy "travellers: customer read own" on public.travellers
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.customer_id = (select auth.uid())
    )
  );

-- Customers add or edit travellers on their own bookings until the departure date.
create policy "travellers: customer insert own before departure" on public.travellers
  for insert to authenticated
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.customer_id = (select auth.uid())
        and b.start_date > current_date
        and b.status not in ('cancelled', 'expired')
    )
  );

create policy "travellers: customer update own before departure" on public.travellers
  for update to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.customer_id = (select auth.uid())
        and b.start_date > current_date
        and b.status not in ('cancelled', 'expired')
    )
  )
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.customer_id = (select auth.uid())
        and b.start_date > current_date
        and b.status not in ('cancelled', 'expired')
    )
  );

create policy "travellers: staff read" on public.travellers
  for select to authenticated
  using ((select public.can_act_as('{sales,sales_manager,operator,accountant,admin}')));

select pg_temp.staff_write_policies(array['travellers'], '{sales,sales_manager,operator,admin}');

-- The event timeline is staff-only (it can hold internal messages). Staff may add events in
-- their own name; system events are written by service-role functions.
create policy "booking_events: staff read" on public.booking_events
  for select to authenticated
  using ((select public.can_act_as('{sales,sales_manager,operator,accountant,admin}')));

create policy "booking_events: staff insert own" on public.booking_events
  for insert to authenticated
  with check (
    (select public.can_act_as('{sales,sales_manager,operator,admin}'))
    and actor_id = (select auth.uid())
  );

-- Payments (financial: admin and accountant need aal2 through can_act_as) -----------------------
-- No write policies: payments are recorded only by service-role Postgres functions (ADR-012).
create policy "payments: customer read own" on public.payments
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.customer_id = (select auth.uid())
    )
  );

create policy "payments: staff read" on public.payments
  for select to authenticated
  using ((select public.can_act_as('{sales,sales_manager,operator,accountant,admin}')));

create policy "payment_links: finance read" on public.payment_links
  for select to authenticated
  using ((select public.can_act_as('{accountant,admin}')));

create policy "webhook_events: finance read" on public.webhook_events
  for select to authenticated
  using ((select public.can_act_as('{accountant,admin}')));

-- Compliance logs: admin reads; writes only by the service role or triggers ----------------------
create policy "consent_records: admin read" on public.consent_records
  for select to authenticated
  using ((select public.can_act_as('{admin}')));

create policy "email_logs: admin read" on public.email_logs
  for select to authenticated
  using ((select public.can_act_as('{admin}')));

create policy "audit_logs: admin read" on public.audit_logs
  for select to authenticated
  using ((select public.can_act_as('{admin}')));

-- Defence in depth: anon never writes directly (guest writes use the service role), and
-- TRUNCATE, which ignores RLS, is closed to both API roles.
revoke insert, update, delete, truncate on all tables in schema public from anon;
revoke truncate on all tables in schema public from authenticated;
