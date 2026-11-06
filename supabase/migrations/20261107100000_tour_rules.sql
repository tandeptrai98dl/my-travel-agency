-- Tour rules (docs/specs/phase-2-catalog-admin.md decisions 1 and 3, ADR-024). The admin services
-- check the same rules first; these keep the API from bypassing them.

-- 1. Prices --------------------------------------------------------------------------------------
-- Only an MFA-verified admin sets prices and terms (ADR-016). On insert the trigger overwrites
-- whatever a non-admin sent, so deleting and re-creating a row cannot get round it. The service
-- role and `postgres` (seeding, Phase 4 functions) are trusted, as in guard_profile_update().

-- The default policy for new tours (cancellation policies are publicly readable, so the editor's
-- own rights are enough).
create function public.default_cancellation_policy_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select id from public.cancellation_policies where is_default
$$;

revoke execute on function public.default_cancellation_policy_id() from public, anon;
grant execute on function public.default_cancellation_policy_id() to authenticated;

create function public.guard_tour_prices()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') or public.can_act_as('{admin}') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- The column defaults (supabase/migrations/*_catalog.sql); 00_schema_test compares them.
    new.from_price := 0;
    new.deposit_percent := 30;
    new.balance_due_days := 30;
    new.cancellation_policy_id := public.default_cancellation_policy_id();
  elsif (new.from_price, new.deposit_percent, new.balance_due_days, new.cancellation_policy_id)
        is distinct from (old.from_price, old.deposit_percent, old.balance_due_days, old.cancellation_policy_id) then
    raise exception 'only an admin sets tour prices and terms' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_tour_prices
  before insert or update on public.tours
  for each row execute function public.guard_tour_prices();

create function public.guard_departure_prices()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  latest record;
begin
  if current_user not in ('anon', 'authenticated') or public.can_act_as('{admin}') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- Operators create departures every day; prices always come from the tour's latest one.
    select d.price_adult, d.price_child, d.price_infant, d.single_supplement
      into latest
      from public.departures d
     where d.tour_id = new.tour_id
     order by d.start_date desc
     limit 1;
    if not found then
      raise exception 'the first departure of a tour is created by an admin' using errcode = '42501';
    end if;
    new.price_adult := latest.price_adult;
    new.price_child := latest.price_child;
    new.price_infant := latest.price_infant;
    new.single_supplement := latest.single_supplement;
  elsif (new.price_adult, new.price_child, new.price_infant, new.single_supplement)
        is distinct from (old.price_adult, old.price_child, old.price_infant, old.single_supplement) then
    raise exception 'only an admin sets departure prices' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_departure_prices
  before insert or update on public.departures
  for each row execute function public.guard_departure_prices();

-- 2. Publishing (decision 3) ------------------------------------------------------------------------

-- Both alt texts present: required for any image shown on published content (decision 6).
create function public.media_alt_complete(media_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select coalesce(trim(m.alt ->> 'vi'), '') <> '' and coalesce(trim(m.alt ->> 'en'), '') <> ''
       from public.media m where m.id = media_id),
    false)
$$;

-- A published tour needs a published translation, a hero image with VI/EN alt text and a price:
-- a departure that is not cancelled for group tours, `from_price` above 0 for private tours.
create function public.check_tour_publishable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'published' then
    return new;
  end if;
  if not exists (select 1 from public.tour_translations t where t.tour_id = new.id and t.is_published) then
    raise exception 'a published tour needs a published translation' using errcode = '23514';
  end if;
  if new.hero_media_id is null or not public.media_alt_complete(new.hero_media_id) then
    raise exception 'a published tour needs a hero image with Vietnamese and English alt text'
      using errcode = '23514';
  end if;
  if new.type = 'private' and new.from_price <= 0 then
    raise exception 'a published private tour needs a price' using errcode = '23514';
  end if;
  if new.type = 'group' and not exists (
    select 1 from public.departures d where d.tour_id = new.id and d.status <> 'cancelled'
  ) then
    raise exception 'a published group tour needs a departure' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Named to run after guard_tour_prices (before-triggers fire in name order), so it checks the
-- prices that will actually be stored.
create trigger validate_tour_publishable
  before insert or update on public.tours
  for each row execute function public.check_tour_publishable();

-- A published translation needs its slug, title, summary and SEO description; a published tour
-- cannot lose its last published translation.
create function public.check_tour_translation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  row_tour_id uuid := coalesce(new.tour_id, old.tour_id);
begin
  -- Moving a translation to another tour would take it from a published tour unnoticed.
  if tg_op = 'UPDATE' and new.tour_id is distinct from old.tour_id then
    raise exception 'a translation cannot move to another tour' using errcode = '23514';
  end if;
  if tg_op <> 'DELETE' and new.is_published and (
       coalesce(trim(new.title), '') = ''
       or coalesce(trim(new.summary), '') = ''
       or coalesce(trim(new.seo_description), '') = ''
     ) then
    raise exception 'a published tour translation needs a title, a summary and an SEO description'
      using errcode = '23514';
  end if;
  if (tg_op = 'DELETE' and old.is_published) or (tg_op = 'UPDATE' and old.is_published and not new.is_published) then
    if exists (select 1 from public.tours t where t.id = row_tour_id and t.status = 'published')
       and not exists (
         select 1 from public.tour_translations t
          where t.tour_id = row_tour_id and t.is_published and t.id <> old.id
       ) then
      raise exception 'unpublish the tour before its last published translation' using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger check_tour_translation
  before insert or update or delete on public.tour_translations
  for each row execute function public.check_tour_translation();

-- Destinations and travel styles: a published item's hero image needs both alt texts (the rule the
-- taxonomy service already applies; PR 10 review).
create function public.check_hero_alt()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and new.hero_media_id is not null
     and not public.media_alt_complete(new.hero_media_id) then
    raise exception 'a published item needs a hero image with Vietnamese and English alt text'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_hero_alt
  before insert or update on public.destinations
  for each row execute function public.check_hero_alt();

create trigger check_hero_alt
  before insert or update on public.travel_styles
  for each row execute function public.check_hero_alt();

-- The reverse move: an image shown as the hero of published content keeps its alt texts.
create function public.keep_hero_alt()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (coalesce(trim(new.alt ->> 'vi'), '') = '' or coalesce(trim(new.alt ->> 'en'), '') = '')
     and (
       exists (select 1 from public.tours t where t.hero_media_id = new.id and t.status = 'published')
       or exists (select 1 from public.destinations d where d.hero_media_id = new.id and d.status = 'published')
       or exists (select 1 from public.travel_styles s where s.hero_media_id = new.id and s.status = 'published')
     ) then
    raise exception 'this image is the hero of published content and needs both alt texts'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger keep_hero_alt
  before update of alt on public.media
  for each row execute function public.keep_hero_alt();

-- 3. Tour codes ---------------------------------------------------------------------------------------
-- Upper-case letters, digits and hyphens (VN-HLB-03): shown to customers and on bookings.
alter table public.tours
  add constraint tours_code_format check (code ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' and char_length(code) <= 20);
