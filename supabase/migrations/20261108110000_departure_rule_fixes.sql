-- PR 13 review follow-ups (ADR-026): serialise the last-departure rule with publishing, and give
-- the booking helper only to the roles that read bookings.

-- 1. A row lock on the tour ------------------------------------------------------------------------
-- Two removals of a published tour's last two departures, or a removal racing the tour's
-- publication, must not both pass their checks. Each check first locks the tour row, so the second
-- waits and then sees the first one's committed change (read committed takes a new snapshot per
-- statement). `SELECT ... FOR UPDATE` applies the UPDATE policies, and operators have none on tours,
-- so the lock is taken by a definer helper; it only locks, for the caller's own transaction.
create function public.lock_tour_row(target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.tours where id = target_id for no key update;
end;
$$;

revoke execute on function public.lock_tour_row(uuid) from public, anon;
grant execute on function public.lock_tour_row(uuid) to authenticated, service_role;

create or replace function public.check_departure_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Staff through the API; the service role and `postgres` (seed, Phase 4 functions) are trusted
  -- with cancellations, as in guard_departure_prices().
  api boolean := current_user in ('anon', 'authenticated');
  leaving boolean := false;
begin
  if tg_op = 'DELETE' then
    leaving := old.status <> 'cancelled';
  else
    if new.capacity < new.seats_reserved then
      raise exception 'capacity cannot be below the reserved seats' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' then
      if api and (new.status = 'cancelled') <> (old.status = 'cancelled') and not public.can_act_as('{admin}') then
        raise exception 'only an admin cancels or reopens a departure' using errcode = '42501';
      end if;
      -- Until Phase 4 cancels bookings with their departure (refunds, emails), a departure with
      -- pending or confirmed bookings is not cancelled through the API.
      if api and new.status = 'cancelled' and old.status <> 'cancelled'
         and public.departure_has_open_bookings(old.id) then
        raise exception 'a departure with pending or confirmed bookings cannot be cancelled'
          using errcode = '23514';
      end if;
      leaving := old.status <> 'cancelled'
                 and (new.status = 'cancelled' or new.tour_id is distinct from old.tour_id);
    end if;
  end if;

  -- check_tour_publishable() needs a departure that is not cancelled for a published group tour;
  -- the reverse move (cancelling, deleting or moving the last one) is refused here, for every role.
  if leaving then
    perform public.lock_tour_row(old.tour_id);
    if exists (
         select 1 from public.tours t
          where t.id = old.tour_id and t.status = 'published' and t.type = 'group'
       )
       and not exists (
         select 1 from public.departures d
          where d.tour_id = old.tour_id and d.status <> 'cancelled' and d.id <> old.id
       ) then
      raise exception 'a published group tour keeps at least one departure that is not cancelled'
        using errcode = '23514';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

-- Same rules as *_tour_rules.sql, plus the lock (an UPDATE already holds it; this keeps the order
-- explicit for inserts and for any future caller).
create or replace function public.check_tour_publishable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'published' then
    return new;
  end if;
  perform public.lock_tour_row(new.id);
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

-- 2. Booking helper only for roles with booking access (ARCHITECTURE.md matrix) ------------------
create or replace function public.departure_has_open_bookings(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_act_as('{sales,sales_manager,operator,accountant,admin}') and exists (
    select 1 from public.bookings b
     where b.departure_id = target_id and b.status in ('pending_payment', 'confirmed')
  )
$$;
