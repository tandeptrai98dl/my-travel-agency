-- Auth integration (docs/specs/phase-0-foundation.md step 5, ADR-004, ADR-009):
-- role helpers used by RLS policies, the auth.users -> profiles trigger and the profile guard.

-- Role helpers --------------------------------------------------------------------------------
-- security definer so policies can read profiles without recursing into profiles' own RLS.
-- They are called by policies on behalf of anon and authenticated, so both keep EXECUTE.

-- Role of the signed-in user; null for anon, unknown, deactivated or deleted users.
create function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active
    and p.deleted_at is null
$$;

create function public.has_role(roles public.user_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() = any (roles), false)
$$;

create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('{sales,sales_manager,operator,accountant,editor,admin}')
$$;

-- True when the current session passed MFA (Supabase sets aal2 after a verified TOTP challenge).
create function public.is_mfa_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
$$;

-- Wrapper kept for ADR-004 naming. Does not check MFA; policies use can_act_as() instead.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('{admin}')
$$;

-- What policies use: the user holds one of the roles and, when that role is admin or
-- accountant, the session has passed MFA (ADR-009). One place for the aal2 rule.
create function public.can_act_as(roles public.user_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role(roles)
    and (
      public.current_user_role() not in ('admin', 'accountant')
      or public.is_mfa_verified()
    )
$$;

revoke execute on function public.current_user_role() from public;
revoke execute on function public.has_role(public.user_role[]) from public;
revoke execute on function public.is_staff() from public;
revoke execute on function public.is_mfa_verified() from public;
revoke execute on function public.is_admin() from public;
revoke execute on function public.can_act_as(public.user_role[]) from public;
grant execute on function public.current_user_role() to anon, authenticated, service_role;
grant execute on function public.has_role(public.user_role[]) to anon, authenticated, service_role;
grant execute on function public.is_staff() to anon, authenticated, service_role;
grant execute on function public.is_mfa_verified() to anon, authenticated, service_role;
grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.can_act_as(public.user_role[]) to anon, authenticated, service_role;

-- New auth user -> profile -------------------------------------------------------------------
-- Every sign-up becomes a customer. Staff roles are granted afterwards by an admin (invitation)
-- or by the service role (seeding).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, locale)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    case
      when new.raw_user_meta_data ->> 'locale' = 'en' then 'en'::public.locale
      else 'vi'::public.locale
    end
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in sync when the user confirms a new email address.
create function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

revoke execute on function public.handle_user_email_change() from public, anon, authenticated;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- Profile guard ------------------------------------------------------------------------------
-- RLS lets customers update their own row, so this trigger protects the admin-controlled
-- columns. Database roles other than anon/authenticated (service_role, postgres) are trusted:
-- they are used for seeding, invitations and the email-sync trigger above.
create function public.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if (new.role, new.is_active, new.deleted_at, new.email)
       is distinct from (old.role, old.is_active, old.deleted_at, old.email)
     and not public.can_act_as('{admin}') then
    raise exception 'only an admin can change role, is_active, deleted_at or email'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'id and created_at cannot change' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_profile_update() from public, anon, authenticated;

create trigger guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();
