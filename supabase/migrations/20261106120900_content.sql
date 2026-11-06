-- Approved schema: docs/DATABASE.md (Content). Copied as approved; do not edit after it is applied.

-- Content
create table reviews (
  id             uuid primary key default gen_random_uuid(),
  tour_id        uuid references tours (id),
  booking_id     uuid unique references bookings (id),
  author_name    text not null,
  author_country text,
  rating         int not null check (rating between 1 and 5),
  title          text,
  content        text not null,
  locale         locale not null,
  travel_date    date,
  is_verified    boolean not null default false,  -- true when linked to a completed booking
  status         review_status not null default 'pending',
  is_featured    boolean not null default false,
  created_at     timestamptz not null default now()
);

create table post_categories (
  id         uuid primary key default gen_random_uuid(),
  sort_order int not null default 0
);

create table post_category_translations (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references post_categories (id) on delete cascade,
  locale      locale not null,
  slug        text not null,
  name        text not null,
  unique (category_id, locale),
  unique (locale, slug)
);

create table posts (
  id             uuid primary key default gen_random_uuid(),
  status         publish_status not null default 'draft',
  category_id    uuid references post_categories (id),
  author_id      uuid references profiles (id),
  cover_media_id uuid references media (id),
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table post_translations (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references posts (id) on delete cascade,
  locale          locale not null,
  slug            text not null,
  title           text not null,
  excerpt         text,
  content         jsonb not null,
  seo_title       text,
  seo_description text,
  is_published    boolean not null default false,
  unique (post_id, locale),
  unique (locale, slug)
);

create table pages (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,  -- about, terms, privacy, cancellation, payment, faq
  status     publish_status not null default 'draft',
  updated_at timestamptz not null default now()
);

create table page_translations (
  id              uuid primary key default gen_random_uuid(),
  page_id         uuid not null references pages (id) on delete cascade,
  locale          locale not null,
  slug            text not null,
  title           text not null,
  content         jsonb not null,
  seo_title       text,
  seo_description text,
  is_published    boolean not null default false,
  unique (page_id, locale),
  unique (locale, slug)
);

create table redirects (
  id          uuid primary key default gen_random_uuid(),
  from_path   text not null unique,
  to_path     text not null,
  status_code int not null default 301,
  hits        int not null default 0,
  created_at  timestamptz not null default now()
);

create table subscribers (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null unique,
  locale             locale not null,
  source             text,
  confirm_token_hash text,
  confirmed_at       timestamptz,  -- double opt-in
  unsubscribed_at    timestamptz,
  created_at         timestamptz not null default now()
);

create trigger set_updated_at before update on public.posts
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.pages
  for each row execute function public.set_updated_at();
