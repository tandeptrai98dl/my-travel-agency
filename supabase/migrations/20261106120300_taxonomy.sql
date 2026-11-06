-- Approved schema: docs/DATABASE.md (Taxonomy). Copied as approved; do not edit after it is applied.

-- Taxonomy
create table destinations (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,  -- 'vietnam', 'ha-long-bay': used in filter URLs
  type          destination_type not null,
  parent_id     uuid references destinations (id),
  status        publish_status not null default 'draft',
  hero_media_id uuid references media (id),
  latitude      numeric(9, 6),
  longitude     numeric(9, 6),
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table destination_translations (
  id                 uuid primary key default gen_random_uuid(),
  destination_id     uuid not null references destinations (id) on delete cascade,
  locale             locale not null,
  slug               text not null,
  name               text not null,
  summary            text,
  content            jsonb,  -- Tiptap JSON
  best_time_to_visit text,
  seo_title          text,
  seo_description    text,
  is_published       boolean not null default false,
  unique (destination_id, locale),
  unique (locale, slug)
);

create table travel_styles (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,
  status        publish_status not null default 'draft',
  hero_media_id uuid references media (id),
  sort_order    int not null default 0
);

create table travel_style_translations (
  id              uuid primary key default gen_random_uuid(),
  travel_style_id uuid not null references travel_styles (id) on delete cascade,
  locale          locale not null,
  slug            text not null,
  name            text not null,
  description     text,
  seo_title       text,
  seo_description text,
  is_published    boolean not null default false,
  unique (travel_style_id, locale),
  unique (locale, slug)
);

create trigger set_updated_at before update on public.destinations
  for each row execute function public.set_updated_at();
