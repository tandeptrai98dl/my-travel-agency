-- Staff rules (docs/specs/phase-2-catalog-admin.md step 22, ADR-032).

-- The admin role always keeps an active holder, and no admin removes their own access.
-- guard_profile_update() already lets only an MFA-verified admin change roles and status; this
-- runs for every role (the service role included), so neither the API nor a script can lock the
-- business out of its own admin.
create function public.keep_active_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role <> 'admin' or not old.is_active or old.deleted_at is not null then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role = 'admin' and new.is_active and new.deleted_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.id = (select auth.uid()) then
    raise exception 'an admin cannot remove their own admin access' using errcode = '42501';
  end if;
  -- Two admins demoting each other at the same moment must not both pass.
  perform pg_advisory_xact_lock(hashtext('public.keep_active_admin'));
  if not exists (
    select 1 from public.profiles p
     where p.role = 'admin' and p.is_active and p.deleted_at is null and p.id <> old.id
  ) then
    raise exception 'the last active admin keeps the role' using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger keep_active_admin
  before update or delete on public.profiles
  for each row execute function public.keep_active_admin();
