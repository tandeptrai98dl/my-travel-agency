-- Taxonomy and cancellation-policy rules (docs/specs/phase-2-catalog-admin.md decisions 3–4,
-- steps 8–10).
begin;
select plan(27);

insert into public.destinations (id, key, type, parent_id) values
  ('50000000-0000-4000-8000-000000000201', 'rules-country', 'country', null),
  ('50000000-0000-4000-8000-000000000202', 'rules-region', 'region', '50000000-0000-4000-8000-000000000201'),
  ('50000000-0000-4000-8000-000000000203', 'rules-city', 'city', '50000000-0000-4000-8000-000000000202');

insert into public.travel_styles (id, key) values ('60000000-0000-4000-8000-000000000201', 'rules-style');

-- Tree shape ---------------------------------------------------------------------------------------
select pass('a country, a region under it and a city under that are accepted');
select throws_ok(
  $$ insert into public.destinations (key, type) values ('orphan-city', 'city') $$,
  '23514', null, 'a city needs a parent'
);
select throws_ok(
  $$ insert into public.destinations (key, type, parent_id)
     values ('city-under-country', 'city', '50000000-0000-4000-8000-000000000201') $$,
  '23514', null, 'a city cannot sit directly under a country'
);
select throws_ok(
  $$ insert into public.destinations (key, type, parent_id)
     values ('nested-country', 'country', '50000000-0000-4000-8000-000000000201') $$,
  '23514', null, 'a country has no parent'
);
select throws_ok(
  $$ update public.destinations set type = 'city' where id = '50000000-0000-4000-8000-000000000202' $$,
  '23514', null, 'a destination with children cannot change type'
);

-- Slugs -----------------------------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.destination_translations (destination_id, locale, slug, name)
     values ('50000000-0000-4000-8000-000000000201', 'vi', 'Việt-Nam', 'Việt Nam') $$,
  '23514', null, 'slugs with capitals or diacritics are refused'
);
select throws_ok(
  $$ insert into public.travel_style_translations (travel_style_id, locale, slug, name)
     values ('60000000-0000-4000-8000-000000000201', 'vi', 'trang--mat', 'Trăng mật') $$,
  '23514', null, 'slugs with double hyphens are refused (travel styles too)'
);
select is(public.is_valid_slug('vinh-ha-long'), true, 'a plain slug is valid');

-- Publishing needs visible text -------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.destination_translations (destination_id, locale, slug, name, is_published)
     values ('50000000-0000-4000-8000-000000000201', 'vi', 'rules-vi', 'Quy tắc', true) $$,
  '23514', null, 'a destination translation cannot be published without a summary'
);
insert into public.destination_translations (destination_id, locale, slug, name, summary)
values ('50000000-0000-4000-8000-000000000201', 'en', 'rules-en', 'Rules', null);
select lives_ok(
  $$ update public.destination_translations set summary = 'A summary', is_published = true
     where slug = 'rules-en' $$,
  'it can be published once the summary is filled in'
);
select throws_ok(
  $$ update public.destination_translations set summary = '  ' where slug = 'rules-en' $$,
  '23514', null, 'a published translation cannot lose its summary'
);
select throws_ok(
  $$ insert into public.travel_style_translations (travel_style_id, locale, slug, name, is_published)
     values ('60000000-0000-4000-8000-000000000201', 'en', 'rules-style', 'Rules', true) $$,
  '23514', null, 'a travel style translation cannot be published without a description'
);

-- Cancellation policies -----------------------------------------------------------------------------------
select is(
  public.is_valid_cancellation_rules(
    '[{"min_days_before": 30, "refund_percent": 80}, {"min_days_before": 0, "refund_percent": 0}]'),
  true, 'decreasing days with non-increasing refunds ending at day 0 are valid'
);
select is(
  public.is_valid_cancellation_rules(
    '[{"min_days_before": 15, "refund_percent": 50}, {"min_days_before": 30, "refund_percent": 80}, {"min_days_before": 0, "refund_percent": 0}]'),
  false, 'rules out of order are refused'
);
select is(
  public.is_valid_cancellation_rules(
    '[{"min_days_before": 30, "refund_percent": 50}, {"min_days_before": 7, "refund_percent": 80}, {"min_days_before": 0, "refund_percent": 0}]'),
  false, 'a later cancellation cannot refund more'
);
select is(public.is_valid_cancellation_rules('[{}]'), false, 'a rule without keys is refused');
select is(public.is_valid_cancellation_rules('[5]'), false, 'a rule that is not an object is refused');
select is(
  public.is_valid_cancellation_rules('[{"min_days_before": 30, "refund_percent": 80}, {"min_days_before": 0}]'),
  false, 'a rule missing its refund is refused'
);
select is(
  public.is_valid_cancellation_rules('[{"min_days_before": 0, "refund_percent": null}]'),
  false, 'a null refund is refused'
);
select throws_ok(
  $$ insert into public.cancellation_policies (name, rules, summary)
     values ('No day 0', '[{"min_days_before": 30, "refund_percent": 80}]', '{}') $$,
  '23514', null, 'rules must cover cancellations up to the day of departure'
);
select throws_ok(
  $$ insert into public.cancellation_policies (name, rules, summary, is_default)
     values ('Second default', '[{"min_days_before": 0, "refund_percent": 0}]', '{}', true) $$,
  '23505', null, 'only one policy can be the default'
);

-- Keys of published items are fixed --------------------------------------------------------------------
update public.destinations set status = 'published' where id = '50000000-0000-4000-8000-000000000201';
select throws_ok(
  $$ update public.destinations set key = 'renamed' where id = '50000000-0000-4000-8000-000000000201' $$,
  '23514', null, 'a published destination keeps its key'
);
select lives_ok(
  $$ update public.destinations set key = 'rules-region-2' where id = '50000000-0000-4000-8000-000000000202' $$,
  'a draft destination may change its key'
);

-- The default policy moves in one step and never disappears ------------------------------------------
insert into public.cancellation_policies (id, name, rules, summary) values
  ('70000000-0000-4000-8000-000000000201', 'Rules policy',
   '[{"min_days_before": 0, "refund_percent": 0}]', '{"vi": "x", "en": "x"}');
select lives_ok(
  $$ select public.set_default_cancellation_policy('70000000-0000-4000-8000-000000000201') $$,
  'the default can be moved to another policy'
);
select is(
  (select array_agg(id::text) from public.cancellation_policies where is_default),
  array['70000000-0000-4000-8000-000000000201'],
  'exactly the chosen policy is the default afterwards'
);
select throws_ok(
  $$ do $d$ begin
       update public.cancellation_policies set is_default = false
       where id = '70000000-0000-4000-8000-000000000201';
       set constraints all immediate;
     end $d$ $$,
  '23514', null, 'the only default cannot be switched off'
);
select throws_ok(
  $$ do $d$ begin
       delete from public.cancellation_policies where id = '70000000-0000-4000-8000-000000000201';
       set constraints all immediate;
     end $d$ $$,
  '23514', null, 'the default cannot be deleted'
);

select * from finish();
rollback;
