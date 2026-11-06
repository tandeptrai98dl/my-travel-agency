-- PR 17 review follow-ups (ADR-030, ADR-031).

-- 1. Images inside a published destination description or a published tour itinerary keep their
-- VI/EN alt text, like covers and images in published articles and pages; and such a translation
-- is published only when its images have both.

-- Image ids of a tour itinerary (`[{..., "media_ids": ["<uuid>"]}]`, one photo per day since PR 18).
create function public.itinerary_media_ids(itinerary jsonb)
returns uuid[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct lower(v #>> '{}')::uuid), '{}')
    from jsonb_path_query(coalesce(itinerary, 'null'::jsonb), 'lax $[*].media_ids[*]') as v
   where jsonb_typeof(v) = 'string'
     and v #>> '{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

create function public.check_tour_itinerary_alt()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_published and exists (
       select 1 from unnest(public.itinerary_media_ids(new.itinerary)) as id where not public.media_alt_complete(id)
     ) then
    raise exception 'itinerary images of a published tour translation need Vietnamese and English alt text'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_tour_itinerary_alt
  before insert or update of is_published, itinerary on public.tour_translations
  for each row execute function public.check_tour_itinerary_alt();

create or replace function public.keep_hero_alt()
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
       or exists (select 1 from public.posts p where p.cover_media_id = new.id and p.status = 'published')
       or exists (
         select 1 from public.post_translations t
          where t.is_published and new.id = any (public.rich_text_media_ids(t.content))
       )
       or exists (
         select 1 from public.page_translations t
          where t.is_published and new.id = any (public.rich_text_media_ids(t.content))
       )
       or exists (
         select 1 from public.destination_translations t
          where t.is_published and new.id = any (public.rich_text_media_ids(t.content))
       )
       or exists (
         select 1 from public.tour_translations t
          where t.is_published and new.id = any (public.itinerary_media_ids(t.itinerary))
       )
     ) then
    raise exception 'this image is the hero of published content and needs both alt texts'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.check_translation_publishable()
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
  -- Destinations have rich text (`content`); travel styles do not, and pass with an empty list.
  if new.is_published and not public.rich_text_alt_complete(to_jsonb(new) -> 'content') then
    raise exception 'images in published content need Vietnamese and English alt text' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- 2. Redirects: one lock for every redirect write, and the two multi-step writes in one function
-- each, so a failure leaves nothing half-moved and two editors cannot build a chain together.
create or replace function public.check_redirect_chain()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('redirects'));
  if exists (select 1 from public.redirects r where r.from_path = new.to_path and r.id <> new.id) then
    raise exception 'the target is itself redirected' using errcode = '23514';
  end if;
  if exists (select 1 from public.redirects r where r.to_path = new.from_path and r.id <> new.id) then
    raise exception 'other redirects point to this path' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Admin "add redirect": refuses a taken source and a redirected target; redirects that pointed at
-- the new source move to its target, in the same transaction. Security invoker: RLS lets editors
-- and admins write.
create function public.create_redirect(source text, target text, status int default 301)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('redirects'));
  if exists (select 1 from public.redirects where from_path = source) then
    raise exception 'this path already has a redirect' using errcode = '23505';
  end if;
  if exists (select 1 from public.redirects where from_path = target) then
    raise exception 'the target is itself redirected' using errcode = '23514';
  end if;
  -- Redirects to the new source would chain: they go straight to the final target. Done first
  -- (the chain trigger refuses a source others point to); a failed insert rolls this back too.
  update public.redirects set to_path = target where to_path = source;
  insert into public.redirects (from_path, to_path, status_code)
  values (source, target, status)
  returning id into new_id;
  return new_id;
end;
$$;

-- Slug changes (decision 4): the new path stops being redirected, redirects to the old path move to
-- the new one, and the old path redirects to the new one.
create function public.record_slug_redirect(source text, target text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('redirects'));
  delete from public.redirects where from_path = target;
  update public.redirects set to_path = target where to_path = source;
  insert into public.redirects (from_path, to_path, status_code)
  values (source, target, 301)
  on conflict (from_path) do update set to_path = excluded.to_path, status_code = 301;
end;
$$;

revoke execute on function public.create_redirect(text, text, int) from public, anon;
revoke execute on function public.record_slug_redirect(text, text) from public, anon;
grant execute on function public.create_redirect(text, text, int) to authenticated, service_role;
grant execute on function public.record_slug_redirect(text, text) to authenticated, service_role;
