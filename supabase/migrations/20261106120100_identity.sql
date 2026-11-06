-- Approved schema: docs/DATABASE.md (Identity). Copied as approved; do not edit after it is applied.

-- Identity
create table profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text not null,
  full_name         text,
  phone             text,
  country           text,
  avatar_url        text,
  role              user_role not null default 'customer',
  locale            locale not null default 'vi',
  marketing_consent boolean not null default false,
  is_active         boolean not null default true,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- The auth.users -> profiles trigger and the role guard are in the auth_integration migration.

create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
