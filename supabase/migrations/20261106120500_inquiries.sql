-- Approved schema: docs/DATABASE.md (Inquiries). Copied as approved; do not edit after it is applied.

-- Inquiries
create table inquiries (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  status             inquiry_status not null default 'new',
  name               text not null,
  email              text not null,
  phone              text,
  country            text,
  company_name       text,  -- corporate clients
  preferred_contact  text,  -- email | phone | zalo | whatsapp
  destination_ids    uuid[] not null default '{}',
  destinations_other text,
  travel_style_id    uuid references travel_styles (id),
  tour_id            uuid references tours (id),  -- sent from a private-tour page
  travel_month       text,  -- '2027-03'
  flexible_dates     boolean not null default true,
  duration_days      int,
  adults             int,  -- null for general contact messages (source = 'contact')
  children           int not null default 0,
  budget_per_person  text,
  message            text,
  locale             locale not null,
  source             text,
  utm                jsonb,
  assigned_to        uuid references profiles (id),
  first_responded_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on inquiries (status, created_at);

create trigger set_updated_at before update on public.inquiries
  for each row execute function public.set_updated_at();
