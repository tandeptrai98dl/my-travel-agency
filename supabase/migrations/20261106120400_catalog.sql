-- Approved schema: docs/DATABASE.md (Catalog). Copied as approved; do not edit after it is applied.

-- Catalog
create table cancellation_policies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  version    int not null default 1,
  rules      jsonb not null,  -- [{"min_days_before": 30, "refund_percent": 80}, ...]
  summary    jsonb not null,  -- {"vi": "...", "en": "..."} shown at checkout
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table tours (
  id                     uuid primary key default gen_random_uuid(),
  code                   text not null unique,
  type                   tour_type not null,
  scope                  tour_scope not null,  -- domestic / international (brief §2)
  status                 publish_status not null default 'draft',
  duration_days          int not null check (duration_days > 0),
  duration_nights        int not null check (duration_nights >= 0),
  min_pax                int not null default 1,
  max_pax                int,
  min_pax_to_operate     int,  -- group tours
  from_price             bigint not null check (from_price >= 0),  -- private tours / tours without departures
  currency               text not null default 'VND',
  deposit_percent        int not null default 30 check (deposit_percent between 0 and 100),
  balance_due_days       int not null default 30,
  child_age_max          int not null default 11,
  infant_age_max         int not null default 1,
  is_featured            boolean not null default false,
  hero_media_id          uuid references media (id),
  cancellation_policy_id uuid references cancellation_policies (id),
  published_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index on tours (status, is_featured);

create table tour_translations (
  id              uuid primary key default gen_random_uuid(),
  tour_id         uuid not null references tours (id) on delete cascade,
  locale          locale not null,
  slug            text not null,
  title           text not null,
  subtitle        text,
  summary         text not null,
  highlights      jsonb not null default '[]',
  itinerary       jsonb not null default '[]',  -- [{day, title, description, meals[], accommodation, media_ids[]}]
  inclusions      jsonb not null default '[]',
  exclusions      jsonb not null default '[]',
  practical_info  jsonb,
  faqs            jsonb,
  seo_title       text,
  seo_description text,
  og_media_id     uuid references media (id),
  is_published    boolean not null default false,
  unique (tour_id, locale),
  unique (locale, slug)
);

create table tour_media (
  tour_id    uuid not null references tours (id) on delete cascade,
  media_id   uuid not null references media (id),
  sort_order int not null default 0,
  primary key (tour_id, media_id)
);

create table tour_destinations (
  tour_id        uuid not null references tours (id) on delete cascade,
  destination_id uuid not null references destinations (id),
  primary key (tour_id, destination_id)
);
create index on tour_destinations (destination_id);

create table tour_travel_styles (
  tour_id         uuid not null references tours (id) on delete cascade,
  travel_style_id uuid not null references travel_styles (id),
  primary key (tour_id, travel_style_id)
);

create table price_tiers (  -- indicative private-tour pricing by group size
  id              uuid primary key default gen_random_uuid(),
  tour_id         uuid not null references tours (id) on delete cascade,
  min_pax         int not null,
  max_pax         int not null,
  price_per_adult bigint not null,
  valid_from      date,
  valid_to        date
);

create table departures (
  id                uuid primary key default gen_random_uuid(),
  tour_id           uuid not null references tours (id),
  start_date        date not null,
  end_date          date not null,
  capacity          int not null check (capacity > 0),
  seats_reserved    int not null default 0,  -- adults + children held or confirmed; infants excluded
  status            departure_status not null default 'open',
  price_adult       bigint not null,
  price_child       bigint,
  price_infant      bigint,
  single_supplement bigint,
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tour_id, start_date),
  check (seats_reserved between 0 and capacity),
  check (end_date >= start_date)
);
create index on departures (tour_id, status, start_date);
create index on departures (start_date, status);

create trigger set_updated_at before update on public.tours
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.departures
  for each row execute function public.set_updated_at();
