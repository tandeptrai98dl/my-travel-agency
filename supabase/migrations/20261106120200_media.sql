-- Approved schema: docs/DATABASE.md (Media). Copied as approved; do not edit after it is applied.

-- Media
create table media (
  id            uuid primary key default gen_random_uuid(),
  bucket        text not null default 'media',
  path          text not null,
  mime_type     text not null,
  width         int,
  height        int,
  size_bytes    int not null,
  blur_data_url text,
  alt           jsonb not null default '{}',  -- {"vi": "...", "en": "..."}
  credit        text,
  created_by    uuid references profiles (id),
  created_at    timestamptz not null default now(),
  unique (bucket, path)
);
