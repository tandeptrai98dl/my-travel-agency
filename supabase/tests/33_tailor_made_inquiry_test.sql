-- Tailor-made wizard and private-tour inquiry write path (Phase 5 PR 5W): service role only,
-- validated input mapped to existing columns, the inquiry and its privacy consent in one
-- transaction.
begin;
select plan(14);

select ok(
  not has_function_privilege('anon', 'public.create_tailor_made_inquiry(jsonb, text, inet, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.create_tailor_made_inquiry(jsonb, text, inet, text)', 'execute'),
  'API roles cannot create tailor-made inquiries directly'
);
select ok(
  has_function_privilege('service_role', 'public.create_tailor_made_inquiry(jsonb, text, inet, text)', 'execute'),
  'the service role can create them'
);

-- Fixture: a published and a draft destination, a published travel style, a published private tour.
insert into public.media (id, path, mime_type, size_bytes, alt) values
  ('80000000-0000-4000-8000-000000003301', '2026/01/80000000-0000-4000-8000-000000003301.jpg', 'image/jpeg', 1, '{"vi": "Ảnh", "en": "Photo"}');
insert into public.destinations (id, key, type, status, sort_order) values
  ('70000000-0000-4000-8000-000000003301', 'tm-test-country', 'country', 'published', 1),
  ('70000000-0000-4000-8000-000000003302', 'tm-test-hidden', 'country', 'draft', 2);
insert into public.travel_styles (id, key, status) values ('71000000-0000-4000-8000-000000003301', 'tm-test-style', 'published');
insert into public.tours (id, code, type, scope, status, duration_days, duration_nights, from_price, hero_media_id) values
  ('40000000-0000-4000-8000-000000003301', 'TM-PRV-01', 'private', 'domestic', 'draft', 5, 4, 1000000, '80000000-0000-4000-8000-000000003301');
insert into public.tour_translations (tour_id, locale, slug, title, summary, seo_description, is_published) values
  ('40000000-0000-4000-8000-000000003301', 'vi', 'tm-kiem-thu', 'Kiểm thử', 'Tóm tắt', 'Mô tả', true);
update public.tours set status = 'published', published_at = now() where id = '40000000-0000-4000-8000-000000003301';

create temporary table result on commit drop as
select public.create_tailor_made_inquiry(
  jsonb_build_object(
    'source', 'tailor_made', 'locale', 'en', 'name', ' Anna ', 'email', ' Anna@Example.COM ', 'phone', '+44 20 0000 0000',
    'preferred_contact', 'whatsapp', 'company_name', 'Acme Ltd', 'country', 'United Kingdom',
    'destination_keys', jsonb_build_array('tm-test-country', 'tm-test-hidden', 'nowhere'), 'destinations_other', 'Laos',
    'travel_style', 'tm-test-style', 'travel_month', to_char((now() at time zone 'Asia/Ho_Chi_Minh') + interval '2 months', 'YYYY-MM'),
    'flexible_dates', false, 'duration_days', 12, 'adults', 2, 'children', 1, 'budget_per_person', '100_200m',
    'message', 'Slow travel, good food.', 'utm', jsonb_build_object('source', 'newsletter', 'evil', 'x', 'medium', '')
  ),
  'privacy-en-0123456789abcdef', '203.0.113.9', 'UA'
) as r;

select matches((select r ->> 'code' from result), '^INQ-[0-9]{4}-[0-9]{4}$', 'it returns the inquiry code');
select is(
  (select id::text from public.inquiries where code = (select r ->> 'code' from result)),
  (select r ->> 'id' from result),
  'and the inquiry id'
);
select is(
  (select name || '|' || email || '|' || source || '|' || status::text || '|' || locale::text || '|' || preferred_contact || '|' || company_name || '|' || country
     from public.inquiries where email = 'anna@example.com'),
  'Anna|anna@example.com|tailor_made|new|en|whatsapp|Acme Ltd|United Kingdom',
  'contact details are stored trimmed and lower-cased, new, with source tailor_made'
);
select is(
  (select destination_ids from public.inquiries where email = 'anna@example.com'),
  array['70000000-0000-4000-8000-000000003301'::uuid],
  'only published destinations are kept'
);
select is(
  (select travel_style_id::text || '|' || flexible_dates || '|' || duration_days || '|' || adults || '|' || children || '|' || budget_per_person || '|' || destinations_other
     from public.inquiries where email = 'anna@example.com'),
  '71000000-0000-4000-8000-000000003301|false|12|2|1|100_200m|Laos',
  'style, timing, party and budget map to the existing columns'
);
select is((select utm from public.inquiries where email = 'anna@example.com'), '{"source": "newsletter"}'::jsonb, 'only known, non-empty campaign tags are kept');
select is(
  (select purpose::text || '|' || document_version || '|' || host(ip)
     from public.consent_records c join public.inquiries i on i.id = c.inquiry_id where i.email = 'anna@example.com'),
  'privacy|privacy-en-0123456789abcdef|203.0.113.9',
  'the privacy consent is recorded with the inquiry'
);

select public.create_tailor_made_inquiry(
  '{"source": "tour_inquiry", "locale": "vi", "name": "Bình", "email": "binh@example.com", "tour_code": "TM-PRV-01", "adults": 4}'::jsonb,
  'privacy-vi-0123456789abcdef'
);
select is(
  (select source || '|' || tour_id::text || '|' || adults || '|' || children || '|' || flexible_dates from public.inquiries where email = 'binh@example.com'),
  'tour_inquiry|40000000-0000-4000-8000-000000003301|4|0|true',
  'a tour inquiry links its published tour with defaults for the rest'
);

select throws_ok(
  $$ select public.create_tailor_made_inquiry('{"source": "tour_inquiry", "locale": "vi", "name": "C", "email": "c@example.com", "tour_code": "NOPE-01", "adults": 2}'::jsonb, 'v') $$,
  '22023', 'tour not found', 'a tour inquiry needs a published tour'
);
select throws_ok(
  $$ select public.create_tailor_made_inquiry('{"source": "tailor_made", "locale": "vi", "name": "C", "email": "c@example.com", "adults": 0}'::jsonb, 'v') $$,
  '22023', 'invalid party', 'at least one adult'
);
select throws_ok(
  $$ select public.create_tailor_made_inquiry('{"source": "tailor_made", "locale": "vi", "name": "C", "email": "c@example.com", "adults": 2, "travel_month": "2001-01"}'::jsonb, 'v') $$,
  '22023', 'invalid travel month', 'a past month is refused'
);
select throws_ok(
  $$ select public.create_tailor_made_inquiry('{"source": "contact", "locale": "vi", "name": "C", "email": "c@example.com", "adults": 2}'::jsonb, 'v') $$,
  '22023', 'invalid source', 'only the wizard and tour form sources'
);

select * from finish();
rollback;
