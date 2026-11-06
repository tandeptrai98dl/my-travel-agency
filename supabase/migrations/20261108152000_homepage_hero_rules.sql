-- The homepage hero image (settings.homepage.hero.media_id, PR 20 review, ADR-032): the settings
-- service checks its alt text on save; the database now also keeps both alt texts and refuses
-- deleting the image while the homepage uses it, like other heroes.

-- Whether an image is the homepage hero. Security invoker: settings are readable by staff (all
-- rows) and visitors (public rows, and `homepage` is public).
create function public.is_homepage_hero(target_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.settings s
     where s.key = 'homepage'
       and lower(s.value #>> '{hero,media_id}') = lower(target_id::text)
  )
$$;

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
       or public.is_homepage_hero(new.id)
     ) then
    raise exception 'this image is the hero of published content and needs both alt texts'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.media_used_in_content(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_staff_or_trusted() and (
       exists (select 1 from public.post_translations where lower(content::text) like '%' || target_id::text || '%')
    or exists (select 1 from public.page_translations where lower(content::text) like '%' || target_id::text || '%')
    or exists (select 1 from public.destination_translations where lower(content::text) like '%' || target_id::text || '%')
    or exists (select 1 from public.tour_translations where lower(itinerary::text) like '%' || target_id::text || '%')
    or public.is_homepage_hero(target_id)
  )
$$;
