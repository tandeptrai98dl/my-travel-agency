-- Journal and static pages (docs/specs/phase-2-catalog-admin.md step 18, decisions 3, 6 and 7).
-- The content admin checks the same rules first; these keep the API from bypassing them.

-- 1. Rich text helpers --------------------------------------------------------------------------------
-- Tiptap JSON (src/lib/rich-text.ts): images are {"type": "image", "attrs": {"mediaId": "<uuid>"}}.

create function public.rich_text_media_ids(doc jsonb)
returns uuid[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct lower(v #>> '{}')::uuid), '{}')
    from jsonb_path_query(coalesce(doc, 'null'::jsonb), 'lax $.** ? (@.type == "image").attrs.mediaId') as v
   where jsonb_typeof(v) = 'string'
     and v #>> '{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

-- No text (other than spaces) and no image.
create function public.rich_text_is_empty(doc jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not jsonb_path_exists(coalesce(doc, 'null'::jsonb), 'lax $.** ? (@.type == "text" && @.text like_regex "\\S")')
     and cardinality(public.rich_text_media_ids(doc)) = 0
$$;

-- Every image in the document has VI and EN alt text (decision 6).
create function public.rich_text_alt_complete(doc jsonb)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(bool_and(public.media_alt_complete(id)), true) from unnest(public.rich_text_media_ids(doc)) as id
$$;

-- 2. Translations: a published one needs its text; a published parent keeps its last one --------------
-- Arguments: the parent column and table ('post_id', 'posts' or 'page_id', 'pages').
create function public.check_content_translation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_column text := tg_argv[0];
  parent_table text := tg_argv[1];
  row_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  row_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  parent_id uuid := coalesce(row_new, row_old) ->> parent_column;
  parent_published boolean;
  others boolean;
begin
  if tg_op = 'UPDATE' and (row_new ->> parent_column) is distinct from (row_old ->> parent_column) then
    raise exception 'a translation cannot move to another item' using errcode = '23514';
  end if;
  if row_new is not null and (row_new ->> 'is_published')::boolean then
    if coalesce(trim(row_new ->> 'title'), '') = '' or coalesce(trim(row_new ->> 'seo_description'), '') = ''
       or public.rich_text_is_empty(row_new -> 'content') then
      raise exception 'a published translation needs a title, content and an SEO description' using errcode = '23514';
    end if;
    if not public.rich_text_alt_complete(row_new -> 'content') then
      raise exception 'images in published content need Vietnamese and English alt text' using errcode = '23514';
    end if;
  end if;
  if row_old is not null and (row_old ->> 'is_published')::boolean
     and (row_new is null or not (row_new ->> 'is_published')::boolean) then
    execute format('select status = ''published'' from public.%I where id = $1', parent_table)
      into parent_published using parent_id;
    execute format(
      'select exists (select 1 from public.%I where %I = $1 and is_published and id <> $2)',
      tg_table_name, parent_column)
      into others using parent_id, (row_old ->> 'id')::uuid;
    if coalesce(parent_published, false) and not others then
      raise exception 'unpublish the item before its last published translation' using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger check_content_translation
  before insert or update or delete on public.post_translations
  for each row execute function public.check_content_translation('post_id', 'posts');

create trigger check_content_translation
  before insert or update or delete on public.page_translations
  for each row execute function public.check_content_translation('page_id', 'pages');

-- 3. Parents: a published post or page needs a published translation; a post also a described cover ---
create function public.check_content_publishable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'published' then
    return new;
  end if;
  if tg_table_name = 'posts' then
    if not exists (select 1 from public.post_translations t where t.post_id = new.id and t.is_published) then
      raise exception 'a published item needs a published translation' using errcode = '23514';
    end if;
    if new.cover_media_id is null or not public.media_alt_complete(new.cover_media_id) then
      raise exception 'a published article needs a cover image with Vietnamese and English alt text'
        using errcode = '23514';
    end if;
  else
    if not exists (select 1 from public.page_translations t where t.page_id = new.id and t.is_published) then
      raise exception 'a published item needs a published translation' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger check_content_publishable
  before insert or update on public.posts
  for each row execute function public.check_content_publishable();

create trigger check_content_publishable
  before insert or update on public.pages
  for each row execute function public.check_content_publishable();

-- 4. Images shown on published content keep both alt texts (extends *_tour_rules.sql) ------------------
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
     ) then
    raise exception 'this image is the hero of published content and needs both alt texts'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- 5. Images referenced inside JSON (not foreign keys) cannot be deleted ---------------------------------
-- Rich text (posts, pages, destinations) and itinerary days (`media_ids`). The text match on the id
-- also covers any JSON shape added later; staff may not read every row, so this runs as definer.
create function public.media_used_in_content(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.post_translations where content::text like '%' || target_id::text || '%')
      or exists (select 1 from public.page_translations where content::text like '%' || target_id::text || '%')
      or exists (select 1 from public.destination_translations where content::text like '%' || target_id::text || '%')
      or exists (select 1 from public.tour_translations where itinerary::text like '%' || target_id::text || '%')
$$;

revoke execute on function public.media_used_in_content(uuid) from public, anon;
grant execute on function public.media_used_in_content(uuid) to authenticated, service_role;

create function public.guard_media_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.media_used_in_content(old.id) then
    -- Same code as a foreign key, so callers treat it as "in use".
    raise exception 'this image is used in content' using errcode = '23503';
  end if;
  return old;
end;
$$;

create trigger guard_media_delete
  before delete on public.media
  for each row execute function public.guard_media_delete();
