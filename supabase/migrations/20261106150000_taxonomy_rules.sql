-- Database-side rules for the taxonomy and cancellation-policy editors
-- (docs/specs/phase-2-catalog-admin.md decisions 3 and 4, steps 8–10). The admin services check
-- the same rules first; these keep the API from bypassing them.

-- Slugs: lower-case ASCII words joined by single hyphens (src/lib/slug.ts), at most 80 characters.
create function public.is_valid_slug(slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'destination_translations', 'travel_style_translations', 'tour_translations',
    'post_translations', 'post_category_translations', 'page_translations'
  ] loop
    execute format(
      'alter table public.%I add constraint %I check (public.is_valid_slug(slug))',
      t, t || '_slug_format'
    );
  end loop;
end;
$$;

-- Destination tree: a country has no parent, a region sits under a country, a city under a
-- region (the mega menu and the tour filters rely on these three levels).
create function public.check_destination_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_type public.destination_type;
begin
  if new.parent_id is null then
    if new.type <> 'country' then
      raise exception 'a % needs a parent destination', new.type using errcode = '23514';
    end if;
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception 'a destination cannot be its own parent' using errcode = '23514';
  end if;
  select d.type into parent_type from public.destinations d where d.id = new.parent_id;
  if (new.type = 'country')
     or (new.type = 'region' and parent_type <> 'country')
     or (new.type = 'city' and parent_type <> 'region') then
    raise exception 'a % cannot sit under a %', new.type, parent_type using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_destination_parent
  before insert or update of type, parent_id on public.destinations
  for each row execute function public.check_destination_parent();

-- A parent cannot change type while it still has children of the old shape.
create function public.check_destination_children()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type <> old.type and exists (select 1 from public.destinations d where d.parent_id = new.id) then
    raise exception 'change the type only after moving its children' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_destination_children
  before update of type on public.destinations
  for each row execute function public.check_destination_children();

-- Publishing a translation needs its visible text (decision 3). SEO title and description fall
-- back to the name and summary on public pages, so they are not required here.
create function public.check_translation_publishable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  body text := to_jsonb(new) ->> tg_argv[0];
  label text := coalesce(to_jsonb(new) ->> 'name', to_jsonb(new) ->> 'title');
begin
  if new.is_published and (coalesce(trim(label), '') = '' or coalesce(trim(body), '') = '') then
    raise exception 'a published translation needs a name and a %', tg_argv[0] using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_translation_publishable
  before insert or update on public.destination_translations
  for each row execute function public.check_translation_publishable('summary');

create trigger check_translation_publishable
  before insert or update on public.travel_style_translations
  for each row execute function public.check_translation_publishable('description');

-- Cancellation policies: structured, consistent rules (ADR-016) and a single default.
create function public.is_valid_cancellation_rules(rules jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  rule jsonb;
  previous_days int := null;
  previous_percent int := null;
  days int;
  percent int;
begin
  if jsonb_typeof(rules) <> 'array' or jsonb_array_length(rules) = 0 or jsonb_array_length(rules) > 10 then
    return false;
  end if;
  for rule in select value from jsonb_array_elements(rules) loop
    if jsonb_typeof(rule -> 'min_days_before') <> 'number' or jsonb_typeof(rule -> 'refund_percent') <> 'number' then
      return false;
    end if;
    days := (rule ->> 'min_days_before')::numeric;
    percent := (rule ->> 'refund_percent')::numeric;
    if (rule ->> 'min_days_before')::numeric <> days or (rule ->> 'refund_percent')::numeric <> percent
       or days < 0 or days > 365 or percent < 0 or percent > 100 then
      return false;
    end if;
    -- Ordered from the earliest cancellation: fewer days before departure never refunds more.
    if previous_days is not null and (days >= previous_days or percent > previous_percent) then
      return false;
    end if;
    previous_days := days;
    previous_percent := percent;
  end loop;
  -- The last rule covers cancellations up to the day of departure.
  return previous_days = 0;
exception when others then
  return false;
end;
$$;

alter table public.cancellation_policies
  add constraint cancellation_policies_rules_valid check (public.is_valid_cancellation_rules(rules));

create unique index cancellation_policies_one_default on public.cancellation_policies (is_default) where is_default;
