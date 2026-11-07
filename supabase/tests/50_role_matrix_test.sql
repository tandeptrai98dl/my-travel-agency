-- Phase 6 PR 6A (docs/specs/phase-6-hardening-launch.md decision 1): the permission matrix of
-- ARCHITECTURE.md "Authorization" and DATABASE.md "RLS policy summary", walked per role and table.
--
-- For every table in `public` and every role state (anon, a customer, and each staff role with an
-- aal1 and an aal2 session), pg_temp.probe() measures what the API role can really do:
--   R  rows it can read:                     none | some | all
--   I  inserting a copy of an existing row:  no | yes   (RLS WITH CHECK and privileges)
--   U  a no-op update (col = col) of the first column it may update: no | some | all | yes
--   D  deleting:                             no | some | all | yes
-- "yes" means rows passed RLS but a later rule (a trigger or a constraint) stopped the statement;
-- "some" and "all" compare with the rows the table owner sees. Every probe runs in a
-- subtransaction that is rolled back, so nothing changes. The expected matrix below is the
-- reviewed one (docs/SECURITY_REVIEW.md "RLS"): a change in a policy, a grant or a role helper
-- changes a cell and fails this test until the matrix and the review are updated together.
--
-- The 01–35 files test each rule in depth; this one makes gaps visible across all of them.
begin;
select plan(42);

-- Fixtures ----------------------------------------------------------------------------------------
-- Every table needs rows, including one a role may see and one it may not, or a cell could pass
-- vacuously. The seed provides the catalog, taxonomy and content; the rest is added here.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000005001', 'rm-customer@example.test', '{}', now()),
  ('00000000-0000-4000-8000-000000005002', 'rm-customer-b@example.test', '{}', now()),
  ('00000000-0000-4000-8000-000000005011', 'rm-sales@example.test', '{}', now()),
  ('00000000-0000-4000-8000-000000005012', 'rm-sales-manager@example.test', '{}', now()),
  ('00000000-0000-4000-8000-000000005013', 'rm-operator@example.test', '{}', now()),
  ('00000000-0000-4000-8000-000000005014', 'rm-accountant@example.test', '{}', now()),
  ('00000000-0000-4000-8000-000000005015', 'rm-editor@example.test', '{}', now()),
  ('00000000-0000-4000-8000-000000005016', 'rm-admin@example.test', '{}', now());
update public.profiles p set role = v.role::public.user_role
  from (values
    ('00000000-0000-4000-8000-000000005011', 'sales'),
    ('00000000-0000-4000-8000-000000005012', 'sales_manager'),
    ('00000000-0000-4000-8000-000000005013', 'operator'),
    ('00000000-0000-4000-8000-000000005014', 'accountant'),
    ('00000000-0000-4000-8000-000000005015', 'editor'),
    ('00000000-0000-4000-8000-000000005016', 'admin')
  ) v(id, role)
 where p.id = v.id::uuid;

insert into public.inquiries (id, code, name, email, locale, source, assigned_to) values
  ('50000000-0000-4000-8000-000000005001', 'INQ-T50-0001', 'Unassigned', 'rm-lead1@example.test', 'vi', 'contact', null),
  ('50000000-0000-4000-8000-000000005002', 'INQ-T50-0002', 'Mine', 'rm-lead2@example.test', 'en', 'tailor_made', '00000000-0000-4000-8000-000000005011'),
  ('50000000-0000-4000-8000-000000005003', 'INQ-T50-0003', 'Someone else''s', 'rm-lead3@example.test', 'vi', 'contact', '00000000-0000-4000-8000-000000005016');

insert into public.bookings (id, code, type, status, tour_id, departure_id, start_date, customer_id, adults, contact_name,
                             contact_email, contact_phone, locale, subtotal, total, deposit_amount, payment_plan, tour_snapshot)
select v.id::uuid, v.code, 'instant', 'draft', d.tour_id, d.id, d.start_date, v.customer_id::uuid, 1, 'Matrix',
       v.email, '+84900000050', 'vi', d.price_adult, d.price_adult, d.price_adult, 'full', '{}'
  from (values
    ('51000000-0000-4000-8000-000000005001', 'PTA-T50-0001', '00000000-0000-4000-8000-000000005001', 'rm-customer@example.test'),
    ('51000000-0000-4000-8000-000000005002', 'PTA-T50-0002', '00000000-0000-4000-8000-000000005002', 'rm-customer-b@example.test')
  ) v(id, code, customer_id, email)
  cross join lateral (
    select d.* from public.departures d join public.tours t on t.id = d.tour_id
     where t.status = 'published' and t.type = 'group' and d.status = 'open' and d.start_date > current_date + 40
     order by d.start_date, d.id limit 1
  ) d;

insert into public.booking_items (booking_id, type, label, unit_price, quantity, amount)
select id, 'adult', 'Adult', total, 1, total from public.bookings where code like 'PTA-T50-%';
insert into public.travellers (booking_id, full_name, is_lead)
select id, contact_name, true from public.bookings where code like 'PTA-T50-%';
insert into public.booking_events (booking_id, type, message)
select id, 'note', 'matrix' from public.bookings where code like 'PTA-T50-%';
insert into public.booking_access_tokens (booking_id, purpose, token_hash, expires_at)
select id, 'email', md5(code) || md5(code), now() + interval '1 day' from public.bookings where code like 'PTA-T50-%';
insert into public.payments (booking_id, provider, kind, status, amount, reference)
select id, 'bank_transfer', 'full', 'pending', total, replace(code, '-', '') || '01' from public.bookings where code like 'PTA-T50-%';
insert into public.payment_links (booking_id, token_hash, amount, kind, expires_at, created_by)
select id, md5('link' || code) || md5(code), total, 'full', now() + interval '1 day', '00000000-0000-4000-8000-000000005011'
  from public.bookings where code like 'PTA-T50-%';
insert into public.webhook_events (provider, event_key, payload, processed_at, error) values
  ('bank_transfer', 'sepay:matrix-1', '{"id": "matrix-1"}', now(), 'unmatched');

insert into public.internal_notes (body, author_id, inquiry_id) values
  ('On the unassigned lead', '00000000-0000-4000-8000-000000005016', '50000000-0000-4000-8000-000000005001'),
  ('On someone else''s lead', '00000000-0000-4000-8000-000000005016', '50000000-0000-4000-8000-000000005003');
insert into public.internal_notes (body, author_id, booking_id) values
  ('On a booking', '00000000-0000-4000-8000-000000005016', '51000000-0000-4000-8000-000000005001');
insert into public.internal_notes (body, author_id, customer_id) values
  ('On a customer', '00000000-0000-4000-8000-000000005011', '00000000-0000-4000-8000-000000005001');

insert into public.subscribers (id, email, locale, confirmed_at) values
  ('53000000-0000-4000-8000-000000005001', 'rm-sub@example.test', 'vi', now());
insert into public.newsletter_unsubscribe_tokens (subscriber_id, token_hash) values
  ('53000000-0000-4000-8000-000000005001', md5('unsub') || md5('unsub'));
insert into public.consent_records (subject_email, profile_id, purpose, granted, document_version) values
  ('rm-customer@example.test', '00000000-0000-4000-8000-000000005001', 'privacy', true, 'privacy-vi-0123456789abcdef');
insert into public.cookie_consents (id, action, choices, banner_version, locale) values
  ('54000000-0000-4000-8000-000000005001', 'essential_only', '{"analytics": false, "marketing": false}', 'banner-vi-0123456789abcdef', 'vi');
insert into public.email_logs (to_email, template, subject, status, booking_id) values
  ('rm-customer@example.test', 'booking_received', 'S', 'sent', '51000000-0000-4000-8000-000000005001');
insert into public.email_logs (to_email, template, subject, status) values
  ('rm-team@example.test', 'staff_inquiry', 'S', 'sent');
insert into public.redirects (from_path, to_path) values ('/rm-old', '/rm-new');
-- Drafts next to the seed's published rows, so "published only" reads show as `some`.
insert into public.tour_media (tour_id, media_id, sort_order)
select t.id, m.id, 99
  from (values ('draft'::public.publish_status), ('published')) v(status)
  cross join lateral (select id from public.tours where status = v.status order by code limit 1) t
  cross join lateral (
    select id from public.media m
     where not exists (select 1 from public.tour_media x where x.tour_id = t.id and x.media_id = m.id)
     order by m.id limit 1
  ) m;
insert into public.price_tiers (tour_id, min_pax, max_pax, price_per_adult)
select id, 2, 4, 1000000 from public.tours where status = 'draft' order by code limit 1;
insert into public.destinations (id, key, type, status) values
  ('55000000-0000-4000-8000-000000005001', 'rm-draft', 'country', 'draft');
insert into public.destination_translations (destination_id, locale, slug, name, is_published) values
  ('55000000-0000-4000-8000-000000005001', 'vi', 'rm-nhap', 'Nháp', false);
insert into public.travel_styles (id, key, status) values
  ('56000000-0000-4000-8000-000000005001', 'rm-draft', 'draft');
insert into public.travel_style_translations (travel_style_id, locale, slug, name, is_published) values
  ('56000000-0000-4000-8000-000000005001', 'vi', 'rm-nhap', 'Nháp', false);
insert into public.posts (id, status) values ('57000000-0000-4000-8000-000000005001', 'draft');
insert into public.post_translations (post_id, locale, slug, title, content, is_published) values
  ('57000000-0000-4000-8000-000000005001', 'vi', 'rm-nhap', 'Nháp', '{"type": "doc", "content": []}', false);

-- Probe -------------------------------------------------------------------------------------------
create function pg_temp.share(n int, total int) returns text language sql immutable as $$
  select case when n <= 0 then 'none' when n >= total then 'all' else 'some' end
$$;

create function pg_temp.probe(target regclass, api_role text, uid uuid, aal text)
returns text
language plpgsql
as $$
declare
  total int;
  seen int;
  n int;
  sample jsonb;
  cols text;
  upd_col name;
  r text; i text; u text; d text;
begin
  execute format('select count(*) from %s', target) into total;
  execute format('select to_jsonb(t) from %s t limit 1', target) into sample;
  -- Policies that check authorship ("insert own") see the caller as the author.
  if uid is not null then
    sample := sample || (select coalesce(jsonb_object_agg(k, uid), '{}') from jsonb_object_keys(sample) k where k in ('author_id', 'created_by'));
  end if;
  -- Only the columns the role may insert (column grants keep e.g. departures.seats_reserved out).
  select string_agg(quote_ident(attname), ', ' order by attnum) into cols
    from pg_attribute
   where attrelid = target and attnum > 0 and not attisdropped and attgenerated = '' and attidentity <> 'a'
     and has_column_privilege(api_role, target, attname, 'INSERT');
  select a.attname into upd_col
    from pg_attribute a
   where a.attrelid = target and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attidentity = ''
     and has_column_privilege(api_role, target, a.attname, 'UPDATE')
     and not exists (select 1 from pg_index x where x.indrelid = target and x.indisprimary and a.attnum = any (x.indkey))
   order by a.attnum
   limit 1;

  perform set_config(
    'request.jwt.claims',
    case when uid is null then json_build_object('role', api_role)::text
         else json_build_object('sub', uid, 'role', api_role, 'aal', aal)::text end,
    true
  );
  perform set_config('role', api_role, true);

  begin
    execute format('select count(*) from %s', target) into seen;
    r := pg_temp.share(seen, total);
  exception when insufficient_privilege then r := 'none';
  end;

  if cols is null then
    i := 'no';
  else
  begin
    execute format('insert into %s (%s) select %s from jsonb_populate_record(null::%s, $1)', target, cols, cols, target) using sample;
    raise exception using errcode = 'PT001', message = 'inserted';
  exception
    when sqlstate 'PT001' then i := 'yes';
    when insufficient_privilege then i := 'no';
    when others then i := case when left(sqlstate, 2) = '23' then 'yes' else 'err' || sqlstate end;
  end;
  end if;

  if upd_col is null then
    u := 'no';
  else
    begin
      execute format('update %s set %I = %I', target, upd_col, upd_col);
      get diagnostics n = row_count;
      raise exception using errcode = 'PT002', message = n::text;
    exception
      when sqlstate 'PT002' then u := case when sqlerrm = '0' then 'no' else pg_temp.share(sqlerrm::int, total) end;
      when insufficient_privilege then u := 'no';
      when others then u := 'yes';
    end;
  end if;

  begin
    execute format('delete from %s', target);
    get diagnostics n = row_count;
    raise exception using errcode = 'PT003', message = n::text;
  exception
    when sqlstate 'PT003' then d := case when sqlerrm = '0' then 'no' else pg_temp.share(sqlerrm::int, total) end;
    when insufficient_privilege then d := 'no';
    when others then d := 'yes';
  end;

  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  return format('R:%s I:%s U:%s D:%s', r, i, u, d);
end;
$$;

create temp table states (state text primary key, api_role text, uid uuid, aal text, ord int);
insert into states values
  ('anon', 'anon', null, null, 1),
  ('customer', 'authenticated', '00000000-0000-4000-8000-000000005001', 'aal1', 2),
  ('sales/aal1', 'authenticated', '00000000-0000-4000-8000-000000005011', 'aal1', 3),
  ('sales/aal2', 'authenticated', '00000000-0000-4000-8000-000000005011', 'aal2', 4),
  ('sales_manager/aal1', 'authenticated', '00000000-0000-4000-8000-000000005012', 'aal1', 5),
  ('sales_manager/aal2', 'authenticated', '00000000-0000-4000-8000-000000005012', 'aal2', 6),
  ('operator/aal1', 'authenticated', '00000000-0000-4000-8000-000000005013', 'aal1', 7),
  ('operator/aal2', 'authenticated', '00000000-0000-4000-8000-000000005013', 'aal2', 8),
  ('accountant/aal1', 'authenticated', '00000000-0000-4000-8000-000000005014', 'aal1', 9),
  ('accountant/aal2', 'authenticated', '00000000-0000-4000-8000-000000005014', 'aal2', 10),
  ('editor/aal1', 'authenticated', '00000000-0000-4000-8000-000000005015', 'aal1', 11),
  ('editor/aal2', 'authenticated', '00000000-0000-4000-8000-000000005015', 'aal2', 12),
  ('admin/aal1', 'authenticated', '00000000-0000-4000-8000-000000005016', 'aal1', 13),
  ('admin/aal2', 'authenticated', '00000000-0000-4000-8000-000000005016', 'aal2', 14);

create temp table actual as
select c.relname::text as tbl, s.state, s.ord, pg_temp.probe(c.oid::regclass, s.api_role, s.uid, s.aal) as got
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
 cross join states s
 where ns.nspname = 'public' and c.relkind = 'r';

-- Expected matrix -----------------------------------------------------------------------------
-- `*` is every state not listed in another row of the same table. Groups: @nonstaff (anon, the
-- customer, and the accountant and admin before MFA, who count as no staff role at all),
-- @sales and @sales_manager (aal1 and aal2), @operator and @editor (aal1 and aal2), @accountant and
-- @admin (aal2 only).
create temp table groups (name text primary key, members text[]);
insert into groups values
  ('@nonstaff', '{anon,customer,accountant/aal1,admin/aal1}'),
  ('@sales', '{sales/aal1,sales/aal2}'),
  ('@sales_manager', '{sales_manager/aal1,sales_manager/aal2}'),
  ('@operator', '{operator/aal1,operator/aal2}'),
  ('@editor', '{editor/aal1,editor/aal2}'),
  ('@accountant', '{accountant/aal2}'),
  ('@admin', '{admin/aal2}');

create temp table expected_rows (tbl text, want text, who text);
insert into expected_rows values
  -- System and compliance: admin at aal2 reads; writes only through triggers and definer functions.
  ('audit_logs', 'R:none I:no U:no D:no', '*'),
  ('audit_logs', 'R:all I:no U:no D:no', '@admin'),
  ('booking_access_tokens', 'R:none I:no U:no D:no', '*'),
  ('booking_access_tokens', 'R:all I:no U:no D:no', '@admin'),
  ('booking_events', 'R:all I:no U:no D:no', '*'),
  ('booking_events', 'R:none I:no U:no D:no', '@nonstaff @editor'),
  ('booking_items', 'R:all I:no U:no D:no', '*'),
  ('booking_items', 'R:none I:no U:no D:no', '@nonstaff @editor'),
  -- Bookings (matrix "Bookings", "Payments"): booking roles read; sales roles and admin edit
  -- contact fields (column grants); money, status and seats only in service-role functions (ADR-012).
  ('bookings', 'R:none I:no U:no D:no', '*'),
  ('bookings', 'R:all I:no U:all D:no', '@sales @sales_manager @admin'),
  ('bookings', 'R:all I:no U:no D:no', '@operator @accountant'),
  -- Catalog: public reads published rows; editors write content; only admin at aal2 sets prices
  -- and policies (ADR-016, ADR-024); operators and admin write departures (ADR-026).
  ('cancellation_policies', 'R:all I:no U:no D:no', '*'),
  ('cancellation_policies', 'R:all I:yes U:all D:yes', '@admin'),
  ('consent_records', 'R:none I:no U:no D:no', '*'),
  ('consent_records', 'R:all I:no U:no D:no', '@admin'),
  ('cookie_consents', 'R:none I:no U:no D:no', '*'),
  ('departures', 'R:all I:no U:no D:no', '*'),
  ('departures', 'R:some I:no U:no D:no', '@nonstaff'),
  ('departures', 'R:all I:yes U:all D:yes', '@operator @admin'),
  ('destination_translations', 'R:all I:no U:no D:no', '*'),
  ('destination_translations', 'R:some I:no U:no D:no', '@nonstaff'),
  ('destination_translations', 'R:all I:yes U:all D:all', '@editor @admin'),
  ('destinations', 'R:all I:no U:no D:no', '*'),
  ('destinations', 'R:some I:no U:no D:no', '@nonstaff'),
  ('destinations', 'R:all I:yes U:all D:yes', '@editor @admin'),
  -- Email log rows of a booking for booking readers (resend), all for admin.
  ('email_logs', 'R:some I:no U:no D:no', '*'),
  ('email_logs', 'R:none I:no U:no D:no', '@nonstaff @editor'),
  ('email_logs', 'R:all I:no U:no D:no', '@admin'),
  -- Inquiries (ADR-037): sales their own and unassigned, managers, operator (read) and admin all;
  -- status, owner and notes otherwise only through the inquiry functions.
  ('inquiries', 'R:none I:no U:no D:no', '*'),
  ('inquiries', 'R:some I:yes U:no D:no', '@sales'),
  ('inquiries', 'R:all I:yes U:no D:no', '@sales_manager'),
  ('inquiries', 'R:all I:no U:no D:no', '@operator'),
  ('inquiries', 'R:all I:yes U:no D:yes', '@admin'),
  ('internal_notes', 'R:none I:no U:no D:no', '*'),
  ('internal_notes', 'R:some I:yes U:no D:no', '@sales'),
  ('internal_notes', 'R:all I:yes U:no D:no', '@sales_manager'),
  ('internal_notes', 'R:all I:no U:no D:no', '@operator'),
  ('internal_notes', 'R:all I:yes U:no D:all', '@admin'),
  -- Content and media: editor and admin (matrix "Destinations, styles, journal ...").
  ('media', 'R:all I:no U:no D:no', '*'),
  ('media', 'R:all I:yes U:all D:yes', '@editor @admin'),
  -- Token tables with no API-role policy at all.
  ('newsletter_unsubscribe_tokens', 'R:none I:no U:no D:no', '*'),
  ('page_translations', 'R:all I:no U:no D:no', '*'),
  ('page_translations', 'R:some I:no U:no D:no', '@nonstaff'),
  ('page_translations', 'R:all I:yes U:all D:yes', '@editor @admin'),
  ('pages', 'R:all I:no U:no D:no', '*'),
  ('pages', 'R:some I:no U:no D:no', '@nonstaff'),
  ('pages', 'R:all I:yes U:all D:all', '@editor @admin'),
  -- Payment links and webhook events: accountant and admin read; writes via the service role.
  ('payment_links', 'R:none I:no U:no D:no', '*'),
  ('payment_links', 'R:all I:no U:no D:no', '@accountant @admin'),
  ('payments', 'R:all I:no U:no D:no', '*'),
  ('payments', 'R:none I:no U:no D:no', '@nonstaff @editor'),
  ('post_categories', 'R:all I:no U:no D:no', '*'),
  ('post_categories', 'R:all I:yes U:all D:yes', '@editor @admin'),
  ('post_category_translations', 'R:all I:no U:no D:no', '*'),
  ('post_category_translations', 'R:all I:yes U:all D:all', '@editor @admin'),
  ('post_translations', 'R:all I:no U:no D:no', '*'),
  ('post_translations', 'R:some I:no U:no D:no', '@nonstaff'),
  ('post_translations', 'R:all I:yes U:all D:yes', '@editor @admin'),
  ('posts', 'R:all I:no U:no D:no', '*'),
  ('posts', 'R:some I:no U:no D:no', '@nonstaff'),
  ('posts', 'R:all I:yes U:all D:yes', '@editor @admin'),
  ('price_tiers', 'R:all I:no U:no D:no', '*'),
  ('price_tiers', 'R:some I:no U:no D:no', '@nonstaff'),
  ('price_tiers', 'R:all I:yes U:all D:all', '@admin'),
  -- Profiles: own row for everyone signed in; customer readers see all; only admin changes role.
  ('profiles', 'R:all I:no U:some D:no', '*'),
  ('profiles', 'R:none I:no U:no D:no', 'anon'),
  ('profiles', 'R:some I:no U:some D:no', '@editor customer accountant/aal1 admin/aal1'),
  ('profiles', 'R:all I:no U:all D:no', '@admin'),
  ('redirects', 'R:none I:no U:no D:no', '*'),
  ('redirects', 'R:all I:yes U:all D:all', '@editor @admin'),
  ('reviews', 'R:all I:no U:no D:no', '*'),
  ('reviews', 'R:some I:no U:no D:no', '@nonstaff'),
  ('reviews', 'R:all I:yes U:all D:all', '@editor @admin'),
  -- Settings: public keys for everyone; staff read; admin writes (accepted in SECURITY_REVIEW.md).
  ('settings', 'R:all I:no U:no D:no', '*'),
  ('settings', 'R:some I:no U:no D:no', '@nonstaff'),
  ('settings', 'R:all I:yes U:all D:all', '@admin'),
  ('subscribers', 'R:none I:no U:no D:no', '*'),
  ('subscribers', 'R:all I:yes U:all D:all', '@editor @admin'),
  ('tour_destinations', 'R:all I:no U:no D:no', '*'),
  ('tour_destinations', 'R:some I:no U:no D:no', '@nonstaff'),
  ('tour_destinations', 'R:all I:yes U:no D:all', '@editor @admin'),
  ('tour_media', 'R:all I:no U:no D:no', '*'),
  ('tour_media', 'R:some I:no U:no D:no', '@nonstaff'),
  ('tour_media', 'R:all I:yes U:all D:all', '@editor @admin'),
  ('tour_translations', 'R:all I:no U:no D:no', '*'),
  ('tour_translations', 'R:some I:no U:no D:no', '@nonstaff'),
  ('tour_translations', 'R:all I:yes U:all D:yes', '@editor @admin'),
  ('tour_travel_styles', 'R:all I:no U:no D:no', '*'),
  ('tour_travel_styles', 'R:some I:no U:no D:no', '@nonstaff'),
  ('tour_travel_styles', 'R:all I:yes U:no D:all', '@editor @admin'),
  ('tours', 'R:all I:no U:no D:no', '*'),
  ('tours', 'R:some I:no U:no D:no', '@nonstaff'),
  ('tours', 'R:all I:yes U:all D:yes', '@editor @admin'),
  ('travel_style_translations', 'R:all I:no U:no D:no', '*'),
  ('travel_style_translations', 'R:some I:no U:no D:no', '@nonstaff'),
  ('travel_style_translations', 'R:all I:yes U:all D:all', '@editor @admin'),
  ('travel_styles', 'R:all I:no U:no D:no', '*'),
  ('travel_styles', 'R:some I:no U:no D:no', '@nonstaff'),
  ('travel_styles', 'R:all I:yes U:all D:yes', '@editor @admin'),
  -- Travellers: booking editors and operators ("edit travellers"); accountant reads.
  ('travellers', 'R:all I:yes U:all D:all', '*'),
  ('travellers', 'R:none I:no U:no D:no', '@nonstaff @editor'),
  ('travellers', 'R:all I:no U:no D:no', '@accountant'),
  ('webhook_events', 'R:none I:no U:no D:no', '*'),
  ('webhook_events', 'R:all I:no U:no D:no', '@accountant @admin');

create temp table expected as
with listed as (
  select e.tbl, e.want, coalesce(g.members, array[w]) as members
    from expected_rows e
   cross join lateral unnest(string_to_array(e.who, ' ')) w
    left join groups g on g.name = w
   where e.who <> '*'
), explicit as (
  select tbl, want, unnest(members) as state from listed
)
select tbl, want, state from explicit
union all
select e.tbl, e.want, s.state
  from expected_rows e cross join states s
 where e.who = '*' and not exists (select 1 from explicit x where x.tbl = e.tbl and x.state = s.state);

-- Assertions ------------------------------------------------------------------------------------
select is(
  (select string_agg(c.relname, ', ' order by c.relname)
     from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r'
      and (select count(*) from expected x where x.tbl = c.relname) <> (select count(*) from states)),
  null,
  'every table has exactly one expected cell per role state (a new table must be added here)'
);

select is(
  (select string_agg(tbl, ', ' order by tbl) from (select distinct tbl from expected_rows) e
    where not exists (select 1 from actual a where a.tbl = e.tbl)),
  null,
  'every table in the matrix exists'
);

select is(
  (select string_agg(c.relname, ', ' order by c.relname)
     from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r'
      and (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::int < 1),
  null,
  'every table has fixture rows, so no cell passes vacuously'
);

select is(
  (select string_agg(format('%s: got %s, expected %s', a.state, a.got, e.want), '; ' order by a.ord)
     from actual a join expected e on e.tbl = a.tbl and e.state = a.state
    where a.tbl = t.tbl and a.got <> e.want),
  null,
  format('%s follows the permission matrix', t.tbl)
)
  from (select distinct tbl from actual) t
 order by t.tbl;

select * from finish();
rollback;
