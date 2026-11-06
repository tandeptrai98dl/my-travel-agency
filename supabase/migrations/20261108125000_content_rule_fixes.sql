-- PR 16 review follow-ups (ADR-030): definer helpers answer only for staff and trusted roles, the
-- media usage match ignores case, and a published article cannot be deleted through the API.

-- Staff (any staff role; MFA is checked by the policies that need it) or a trusted connection:
-- the service role, or a session without SET ROLE (postgres: migrations, seed, pg_cron). The `role`
-- setting is not changed by security definer, so it still names the caller here.
create function public.is_staff_or_trusted()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_staff()
      or coalesce(nullif(current_setting('role', true), ''), 'none') in ('none', 'service_role')
$$;

revoke execute on function public.is_staff_or_trusted() from public, anon;
grant execute on function public.is_staff_or_trusted() to authenticated, service_role;

-- 1. The tour lock is a no-op for everyone else (the triggers that use it run for staff writes).
create or replace function public.lock_tour_row(target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_staff_or_trusted() then
    perform 1 from public.tours where id = target_id for no key update;
  end if;
end;
$$;

-- 2 and 3. Usage of an image inside JSON: only for staff and trusted roles, and in any letter case
-- (the admin stores lower-case ids, the API could write upper-case ones).
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
  )
$$;

-- 4. A published article is unpublished before it is deleted (its public URL would break). The
-- translation rule does not cover this: a cascaded delete runs after the article row is gone.
create function public.guard_post_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'published' then
    raise exception 'unpublish the article before deleting it' using errcode = '23514';
  end if;
  return old;
end;
$$;

create trigger guard_post_delete
  before delete on public.posts
  for each row execute function public.guard_post_delete();
