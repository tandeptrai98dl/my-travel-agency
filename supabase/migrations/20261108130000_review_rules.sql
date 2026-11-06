-- Reviews moderation (docs/specs/phase-2-catalog-admin.md step 19, ADR-031). Staff approve, reject
-- and feature reviews; the customer's words, the link to a booking and the verified flag are
-- never edited through the API (verified reviews come from completed bookings, P1).

-- Only status and featured are writable by API roles.
revoke update on public.reviews from authenticated;
grant update (status, is_featured) on public.reviews to authenticated;

-- A featured review is an approved one (homepage and tour pages show featured reviews).
alter table public.reviews
  add constraint reviews_featured_approved check (not is_featured or status = 'approved');

-- Reviews written in by staff (a guest's email, a printed card) are never "verified" and never
-- linked to a booking; the service role (P1 post-trip reviews) is trusted.
create function public.guard_review_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.is_verified := false;
    new.booking_id := null;
  end if;
  return new;
end;
$$;

create trigger guard_review_insert
  before insert on public.reviews
  for each row execute function public.guard_review_insert();
