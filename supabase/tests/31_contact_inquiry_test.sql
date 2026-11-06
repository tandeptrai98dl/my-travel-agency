-- Contact form write path (Phase 3 PR K): service role only, validated input, the inquiry and its
-- privacy consent in one transaction.
begin;
select plan(12);

select ok(
  not has_function_privilege('anon', 'public.create_contact_inquiry(text, text, text, text, text, public.locale, text, text, inet, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.create_contact_inquiry(text, text, text, text, text, public.locale, text, text, inet, text)', 'execute'),
  'API roles cannot create inquiries directly'
);
select ok(
  not has_function_privilege('anon', 'public.next_inquiry_code()', 'execute')
  and not has_function_privilege('authenticated', 'public.next_inquiry_code()', 'execute'),
  'API roles cannot draw inquiry codes'
);
select ok(
  has_function_privilege('service_role', 'public.create_contact_inquiry(text, text, text, text, text, public.locale, text, text, inet, text)', 'execute'),
  'the service role can create contact inquiries'
);
select ok(
  not has_sequence_privilege('anon', 'public.inquiry_code_seq', 'usage')
  and not has_sequence_privilege('authenticated', 'public.inquiry_code_seq', 'usage'),
  'API roles cannot use the code sequence'
);

-- Fixture: one published tour, one draft.
insert into public.media (id, path, mime_type, size_bytes, alt) values
  ('80000000-0000-4000-8000-000000003101', '2026/01/80000000-0000-4000-8000-000000003101.jpg', 'image/jpeg', 1, '{"vi": "Ảnh", "en": "Photo"}');
insert into public.tours (id, code, type, scope, status, duration_days, duration_nights, from_price, hero_media_id) values
  ('40000000-0000-4000-8000-000000003101', 'KT-LH-01', 'private', 'domestic', 'draft', 3, 2, 1000000, '80000000-0000-4000-8000-000000003101'),
  ('40000000-0000-4000-8000-000000003102', 'KT-LH-02', 'private', 'domestic', 'draft', 3, 2, 1000000, '80000000-0000-4000-8000-000000003101');
insert into public.tour_translations (tour_id, locale, slug, title, summary, seo_description, is_published) values
  ('40000000-0000-4000-8000-000000003101', 'vi', 'kiem-thu-lien-he', 'Kiểm thử liên hệ', 'Tóm tắt', 'Mô tả', true);
update public.tours set status = 'published', published_at = now() where id = '40000000-0000-4000-8000-000000003101';

select matches(
  public.create_contact_inquiry(' Lan ', ' Lan@Example.COM ', '+84 90 000 0000', 'zalo', 'Tôi muốn hỏi về tour Hạ Long.', 'vi', 'KT-LH-01', 'privacy-2026-11', '203.0.113.7', 'UA'),
  '^INQ-[0-9]{4}-[0-9]{4}$',
  'a valid message returns an inquiry code'
);
select is(
  (select name || '|' || email || '|' || source || '|' || status::text || '|' || coalesce(adults::text, 'null') || '|' || preferred_contact
     from public.inquiries where email = 'lan@example.com'),
  'Lan|lan@example.com|contact|new|null|zalo',
  'the inquiry is stored trimmed, lower-cased, new, with source contact and no traveller numbers'
);
select is(
  (select tour_id from public.inquiries where email = 'lan@example.com'),
  '40000000-0000-4000-8000-000000003101'::uuid,
  'a published tour code links the tour'
);
select is(
  (select purpose::text || '|' || granted || '|' || document_version || '|' || host(ip)
     from public.consent_records c join public.inquiries i on i.id = c.inquiry_id where i.email = 'lan@example.com'),
  'privacy|true|privacy-2026-11|203.0.113.7',
  'the privacy consent is recorded with the inquiry'
);

select public.create_contact_inquiry('Minh', 'minh@example.com', null, null, 'Một câu hỏi chung về lịch trình.', 'en', 'KT-LH-02', 'privacy-2026-11');
select is(
  (select tour_id from public.inquiries where email = 'minh@example.com'),
  null,
  'a draft tour code is ignored'
);

select throws_ok(
  $$select public.create_contact_inquiry('Lan', 'not-an-email', null, null, 'Một câu hỏi chung.', 'vi', null, 'v1')$$,
  '22023', 'invalid email', 'an invalid email is refused'
);
select throws_ok(
  $$select public.create_contact_inquiry('Lan', 'lan@example.com', null, 'fax', 'Một câu hỏi chung.', 'vi', null, 'v1')$$,
  '22023', 'invalid preferred contact', 'an unknown contact channel is refused'
);
select throws_ok(
  $$select public.create_contact_inquiry('Lan', 'lan@example.com', null, null, 'ngắn', 'vi', null, 'v1')$$,
  '22023', 'invalid message', 'a message under 10 characters is refused'
);

select * from finish();
rollback;
