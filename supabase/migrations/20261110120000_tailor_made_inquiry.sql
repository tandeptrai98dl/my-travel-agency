-- Tailor-made wizard and private-tour inquiry form (Phase 5 PR 5W, spec decision 9 and the
-- cross-stream table): a guest write per ARCHITECTURE "Guest writes". The Server Action validates
-- with Zod, rate-limits, verifies Turnstile, then calls create_tailor_made_inquiry() with the
-- service role. It maps the wizard to existing inquiry columns only and records the privacy
-- consent with the published policy's version (ADR-035) in the same transaction. No table, policy
-- or grant changes.

create or replace function public.create_tailor_made_inquiry(
  payload jsonb,
  privacy_version text,
  ip inet default null,
  user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text := payload ->> 'source';
  v_locale text := payload ->> 'locale';
  v_name text := btrim(payload ->> 'name');
  v_email text := lower(btrim(payload ->> 'email'));
  v_phone text := nullif(btrim(payload ->> 'phone'), '');
  v_contact text := coalesce(nullif(payload ->> 'preferred_contact', ''), 'email');
  v_company text := nullif(btrim(payload ->> 'company_name'), '');
  v_country text := nullif(btrim(payload ->> 'country'), '');
  v_other text := nullif(btrim(payload ->> 'destinations_other'), '');
  v_month text := nullif(payload ->> 'travel_month', '');
  v_flexible boolean := coalesce((payload ->> 'flexible_dates')::boolean, true);
  v_duration int := nullif(payload ->> 'duration_days', '')::int;
  v_adults int := (payload ->> 'adults')::int;
  v_children int := coalesce(nullif(payload ->> 'children', '')::int, 0);
  v_budget text := nullif(payload ->> 'budget_per_person', '');
  v_message text := nullif(btrim(payload ->> 'message'), '');
  v_keys text[];
  v_destinations uuid[];
  v_style uuid;
  v_tour uuid;
  v_utm jsonb;
  v_this_month date := date_trunc('month', (now() at time zone 'Asia/Ho_Chi_Minh'))::date;
  v_id uuid;
  v_code text;
begin
  if v_source is null or v_source not in ('tailor_made', 'tour_inquiry') then
    raise exception 'invalid source' using errcode = '22023';
  end if;
  if v_locale is null or v_locale not in ('vi', 'en') then
    raise exception 'invalid locale' using errcode = '22023';
  end if;
  -- The published policy's version as content-public.service.ts writes it (same check as #42).
  if privacy_version is null or privacy_version !~ '^privacy-(vi|en)-[0-9a-f]{16}$' then
    raise exception 'invalid privacy version' using errcode = '22023';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 120 then
    raise exception 'invalid name' using errcode = '22023';
  end if;
  if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  if v_phone is not null and v_phone !~ '^[+0-9 ().-]{6,30}$' then
    raise exception 'invalid phone' using errcode = '22023';
  end if;
  if v_contact not in ('email', 'phone', 'zalo', 'whatsapp') then
    raise exception 'invalid preferred contact' using errcode = '22023';
  end if;
  if char_length(v_company) > 160 or char_length(v_country) > 80 or char_length(v_other) > 300 then
    raise exception 'text too long' using errcode = '22023';
  end if;
  if v_month is not null and (
    v_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    or to_date(v_month || '-01', 'YYYY-MM-DD') < v_this_month
    or to_date(v_month || '-01', 'YYYY-MM-DD') > (v_this_month + interval '36 months')
  ) then
    raise exception 'invalid travel month' using errcode = '22023';
  end if;
  if v_duration is not null and v_duration not between 1 and 60 then
    raise exception 'invalid duration' using errcode = '22023';
  end if;
  if v_adults is null or v_adults not between 1 and 50 or v_children not between 0 and 50 then
    raise exception 'invalid party' using errcode = '22023';
  end if;
  if v_budget is not null and v_budget not in ('under_30m', '30_60m', '60_100m', '100_200m', 'over_200m', 'not_sure') then
    raise exception 'invalid budget' using errcode = '22023';
  end if;
  if char_length(v_message) > 4000 then
    raise exception 'message too long' using errcode = '22023';
  end if;

  -- Destinations and the travel style by their public keys; unknown or unpublished keys are dropped.
  if jsonb_typeof(payload -> 'destination_keys') = 'array' then
    select array_agg(value) into v_keys from (select value from jsonb_array_elements_text(payload -> 'destination_keys') limit 20) as k;
    select coalesce(array_agg(id order by sort_order), '{}') into v_destinations
    from public.destinations where key = any(v_keys) and status = 'published';
  end if;
  if nullif(payload ->> 'travel_style', '') is not null then
    select id into v_style from public.travel_styles where key = payload ->> 'travel_style' and status = 'published';
  end if;
  if nullif(payload ->> 'tour_code', '') is not null then
    -- The inquiry form is only on private tours' pages; group tours are booked online.
    select id into v_tour from public.tours
    where code = btrim(payload ->> 'tour_code') and status = 'published' and (v_source <> 'tour_inquiry' or type = 'private');
  end if;
  if v_source = 'tour_inquiry' and v_tour is null then
    raise exception 'tour not found' using errcode = '22023';
  end if;
  -- Campaign tags only, as short strings.
  if jsonb_typeof(payload -> 'utm') = 'object' then
    select nullif(jsonb_object_agg(key, left(value, 100)), '{}'::jsonb) into v_utm
    from jsonb_each_text(payload -> 'utm')
    where key in ('source', 'medium', 'campaign', 'term', 'content') and value <> '';
  end if;

  v_code := public.next_inquiry_code();
  insert into public.inquiries (
    code, name, email, phone, country, company_name, preferred_contact, destination_ids, destinations_other,
    travel_style_id, tour_id, travel_month, flexible_dates, duration_days, adults, children,
    budget_per_person, message, locale, source, utm
  )
  values (
    v_code, v_name, v_email, v_phone, v_country, v_company, v_contact, coalesce(v_destinations, '{}'), v_other,
    v_style, v_tour, v_month, v_flexible, v_duration, v_adults, v_children,
    v_budget, v_message, v_locale::public.locale, v_source, v_utm
  )
  returning id into v_id;

  insert into public.consent_records (subject_email, purpose, granted, document_version, inquiry_id, ip, user_agent)
  values (v_email, 'privacy', true, privacy_version, v_id, ip, left(user_agent, 500));

  return jsonb_build_object('id', v_id, 'code', v_code);
end;
$$;

comment on function public.create_tailor_made_inquiry(jsonb, text, inet, text) is
  'Tailor-made wizard and private-tour inquiry form (service role only): saves an inquiry (source tailor_made or tour_inquiry) with the privacy consent; returns {id, code}.';

revoke execute on function public.create_tailor_made_inquiry(jsonb, text, inet, text) from public, anon, authenticated;
grant execute on function public.create_tailor_made_inquiry(jsonb, text, inet, text) to service_role;
