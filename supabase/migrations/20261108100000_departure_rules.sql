-- Departure rules (docs/specs/phase-2-catalog-admin.md step 16, ADR-026). The departures admin
-- checks the same rules first; these keep the API from bypassing them. Prices stay with
-- guard_departure_prices() (ADR-024); seats stay out of the API grants (ADR-012).

-- Whether a departure has bookings that hold seats or money (pending payment or confirmed). Staff
-- read bookings per role (sales, operator, accountant, admin), but the cancel rule must see them
-- all, so this runs as definer; it answers only for staff, so customers learn nothing from it.
create function public.departure_has_open_bookings(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_staff() and exists (
    select 1 from public.bookings b
     where b.departure_id = target_id and b.status in ('pending_payment', 'confirmed')
  )
$$;

revoke execute on function public.departure_has_open_bookings(uuid) from public, anon;
grant execute on function public.departure_has_open_bookings(uuid) to authenticated, service_role;

create function public.check_departure_change()
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
  -- the reverse move (cancelling or deleting the last one) is refused here, for every role.
  if leaving
     and exists (
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

  return coalesce(new, old);
end;
$$;

create trigger check_departure_change
  before insert or update or delete on public.departures
  for each row execute function public.check_departure_change();
