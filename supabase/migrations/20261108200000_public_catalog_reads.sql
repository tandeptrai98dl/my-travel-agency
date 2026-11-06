-- Public catalog reads (docs/specs/phase-3-public-site.md decision 8, docs/specs/tour-listing.md
-- §3–4.3): diacritic-insensitive title search, the booking cutoff, the tour search used by every
-- tour card, and the live departures of one tour. Read-only: no table, policy or grant on the
-- tables changes here.

-- 1. unaccent with an explicit dictionary, immutable so it can be indexed.
create function public.immutable_unaccent(value text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, value)
$$;

comment on function public.immutable_unaccent(text) is
  'unaccent() with a fixed dictionary, immutable for indexes ("Hạ Long" -> "Ha Long").';

-- 2. Trigram index for the title search ("ha long" finds "Vịnh Hạ Long").
create index tour_translations_title_search_idx
  on public.tour_translations
  using gin (public.immutable_unaccent(lower(title)) extensions.gin_trgm_ops);

-- 3. Days between today (Vietnam) and the first bookable departure. `booking_rules` is not a public
-- setting, so this exposes the one number and nothing else of the row. Default 7, clamped to 0–60.
create function public.booking_cutoff_days()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select least(greatest(floor((s.value ->> 'booking_cutoff_days')::numeric)::int, 0), 60)
      from public.settings s
      where s.key = 'booking_rules'
        and jsonb_typeof(s.value -> 'booking_cutoff_days') = 'number'
    ),
    7
  )
$$;

comment on function public.booking_cutoff_days() is
  'Booking cutoff in days from settings.booking_rules (default 7); public, exposes only this number.';

revoke execute on function public.booking_cutoff_days() from public;
grant execute on function public.booking_cutoff_days() to anon, authenticated, service_role;

-- 4. Tour search. Security invoker: RLS decides what the caller sees (published tours and
-- translations for anon). Bookable departure: open or guaranteed, on or after today + cutoff, seats
-- left; with a month filter only those months count. Group tours without one show from_price and
-- no date (and drop out under a month filter); private tours always use from_price.
create function public.search_tours(
  p_locale public.locale,
  p_q text default null,
  p_scopes public.tour_scope[] default null,
  p_destination_ids uuid[] default null,
  p_travel_style_ids uuid[] default null,
  p_price_min bigint default null,
  p_price_max bigint default null,
  p_months date[] default null,
  p_durations text[] default null,
  p_sort text default 'recommended',
  p_limit int default 12,
  p_offset int default 0,
  p_featured_only boolean default false,
  p_exclude_ids uuid[] default null
)
returns table (
  tour_id uuid,
  display_price bigint,
  price_source text,
  next_departure_date date,
  other_departure_count int,
  seats_left_next int,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      (now() at time zone 'Asia/Ho_Chi_Minh')::date + public.booking_cutoff_days() as min_start,
      case
        when char_length(btrim(coalesce(p_q, ''))) between 2 and 100 then btrim(p_q)
      end as q
  ),
  bookable as (
    select d.tour_id, d.start_date, d.price_adult, d.capacity - d.seats_reserved as seats_left
    from public.departures d
    cross join params
    where d.status in ('open', 'guaranteed')
      and d.start_date >= params.min_start
      and d.capacity > d.seats_reserved
      and (p_months is null or date_trunc('month', d.start_date)::date = any (p_months))
  ),
  per_tour as (
    select
      b.tour_id,
      min(b.price_adult) as min_price,
      min(b.start_date) as next_date,
      count(*)::int as departure_count,
      -- Seats left on the earliest departure (the smallest when two share that date).
      (array_agg(b.seats_left order by b.start_date, b.seats_left))[1] as seats_left_next
    from bookable b
    group by b.tour_id
  ),
  candidates as (
    select
      t.id,
      t.is_featured,
      t.published_at,
      t.duration_days,
      case when t.type = 'group' and p.tour_id is not null then p.min_price else t.from_price end
        as display_price,
      case when t.type = 'group' and p.tour_id is not null then 'departure' else 'from_price' end
        as price_source,
      case when t.type = 'group' then p.next_date end as next_date,
      case when t.type = 'group' then greatest(coalesce(p.departure_count, 0) - 1, 0) else 0 end
        as other_count,
      case when t.type = 'group' then p.seats_left_next end as seats_left_next
    from public.tours t
    join public.tour_translations tt
      on tt.tour_id = t.id and tt.locale = p_locale and tt.is_published
    left join per_tour p on p.tour_id = t.id
    cross join params
    where t.status = 'published'
      and (p_scopes is null or t.scope = any (p_scopes))
      and (p_months is null or t.type = 'private' or p.tour_id is not null)
      and (
        params.q is null
        or public.immutable_unaccent(lower(tt.title)) like
          '%' || replace(replace(replace(public.immutable_unaccent(lower(params.q)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
          escape '\'
        or t.code = upper(params.q)
      )
      and (
        p_destination_ids is null
        or exists (
          select 1 from public.tour_destinations td
          where td.tour_id = t.id and td.destination_id = any (p_destination_ids)
        )
      )
      and (
        p_travel_style_ids is null
        or exists (
          select 1 from public.tour_travel_styles ts
          where ts.tour_id = t.id and ts.travel_style_id = any (p_travel_style_ids)
        )
      )
      and (
        p_durations is null
        or case
          when t.duration_days <= 4 then '1-4'
          when t.duration_days <= 8 then '5-8'
          when t.duration_days <= 14 then '9-14'
          else '15-plus'
        end = any (p_durations)
      )
      and (not coalesce(p_featured_only, false) or t.is_featured)
      and (p_exclude_ids is null or t.id <> all (p_exclude_ids))
  )
  select
    c.id,
    c.display_price,
    c.price_source,
    c.next_date,
    c.other_count,
    c.seats_left_next,
    count(*) over ()
  from candidates c
  where (p_price_min is null or c.display_price >= p_price_min)
    and (p_price_max is null or c.display_price <= p_price_max)
  order by
    case when p_sort = 'recommended' then c.is_featured end desc nulls last,
    case when p_sort in ('recommended', 'departure_asc') then c.next_date end asc nulls last,
    case when p_sort = 'recommended' then c.published_at end desc nulls last,
    case when p_sort = 'price_asc' then c.display_price end asc,
    case when p_sort = 'price_desc' then c.display_price end desc,
    case when p_sort = 'duration_asc' then c.duration_days end asc,
    case when p_sort = 'duration_asc' then c.display_price end asc,
    c.id
  limit least(greatest(coalesce(p_limit, 12), 1), 48)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

comment on function public.search_tours(public.locale, text, public.tour_scope[], uuid[], uuid[], bigint, bigint, date[], text[], text, int, int, boolean, uuid[]) is
  'Published tours with display price and next bookable departure (docs/specs/tour-listing.md §4.3).';

revoke execute on function public.search_tours(public.locale, text, public.tour_scope[], uuid[], uuid[], bigint, bigint, date[], text[], text, int, int, boolean, uuid[]) from public;
grant execute on function public.search_tours(public.locale, text, public.tour_scope[], uuid[], uuid[], bigint, bigint, date[], text[], text, int, int, boolean, uuid[]) to anon, authenticated, service_role;

-- 5. Upcoming departures of one tour for its public page: from today (Vietnam), not cancelled, in
-- date order, with seats left and whether it can be booked now. Security invoker (RLS: published
-- tours only for anon).
create function public.tour_departures(p_tour_id uuid, p_limit int default 24)
returns table (
  id uuid,
  start_date date,
  end_date date,
  status public.departure_status,
  price_adult bigint,
  price_child bigint,
  price_infant bigint,
  single_supplement bigint,
  seats_left int,
  bookable boolean,
  note text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      (now() at time zone 'Asia/Ho_Chi_Minh')::date as today,
      (now() at time zone 'Asia/Ho_Chi_Minh')::date + public.booking_cutoff_days() as min_start
  )
  select
    d.id,
    d.start_date,
    d.end_date,
    d.status,
    d.price_adult,
    d.price_child,
    d.price_infant,
    d.single_supplement,
    greatest(d.capacity - d.seats_reserved, 0),
    d.status in ('open', 'guaranteed') and d.start_date >= params.min_start
      and d.capacity > d.seats_reserved,
    d.note
  from public.departures d
  cross join params
  where d.tour_id = p_tour_id
    and d.status <> 'cancelled'
    and d.start_date >= params.today
  order by d.start_date, d.id
  limit least(greatest(coalesce(p_limit, 24), 1), 60)
$$;

comment on function public.tour_departures(uuid, int) is
  'Upcoming, not cancelled departures of a tour with seats left and bookability (public tour page).';

revoke execute on function public.tour_departures(uuid, int) from public;
grant execute on function public.tour_departures(uuid, int) to anon, authenticated, service_role;
