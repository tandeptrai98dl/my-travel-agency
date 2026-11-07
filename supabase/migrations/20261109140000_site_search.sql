-- Site search (docs/specs/phase-3-public-site.md step 18): destinations and journal articles that
-- match a term in one language, diacritic- and case-insensitive like search_tours(). Tours are
-- searched with search_tours(p_q). Security invoker: RLS still applies (anon reads published rows
-- only), and the published checks are repeated so the function never depends on the caller's role.

create or replace function public.search_site(p_locale public.locale, p_q text, p_limit int default 8)
returns table (
  kind text,
  id uuid,
  slug text,
  title text,
  summary text,
  published_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with term as (
    -- The term with LIKE's wildcards and escape character taken literally; null when too short or long.
    select
      case
        when char_length(btrim(coalesce(p_q, ''))) between 2 and 100 then
          replace(replace(replace(public.immutable_unaccent(lower(btrim(p_q))), '\', '\\'), '%', '\%'), '_', '\_')
      end as escaped
  ),
  params as (
    select
      '%' || term.escaped || '%' as pattern,
      term.escaped || '%' as prefix,
      least(greatest(coalesce(p_limit, 8), 1), 20) as max_rows
    from term
  ),
  destination_hits as (
    select
      'destination'::text as kind,
      d.id,
      dt.slug,
      dt.name as title,
      dt.summary,
      null::timestamptz as published_at,
      -- Names that start with the term first, then names that contain it, then summaries.
      case
        when public.immutable_unaccent(lower(dt.name)) like params.prefix escape '\' then 0
        when public.immutable_unaccent(lower(dt.name)) like params.pattern escape '\' then 1
        else 2
      end as rank,
      d.sort_order as tiebreak
    from public.destinations d
    join public.destination_translations dt on dt.destination_id = d.id
    cross join params
    where params.pattern is not null
      and d.status = 'published'
      and dt.locale = p_locale
      and dt.is_published
      and (
        public.immutable_unaccent(lower(dt.name)) like params.pattern escape '\'
        or public.immutable_unaccent(lower(coalesce(dt.summary, ''))) like params.pattern escape '\'
      )
  ),
  post_hits as (
    select
      'post'::text as kind,
      p.id,
      pt.slug,
      pt.title,
      pt.excerpt as summary,
      p.published_at,
      case
        when public.immutable_unaccent(lower(pt.title)) like params.prefix escape '\' then 0
        when public.immutable_unaccent(lower(pt.title)) like params.pattern escape '\' then 1
        else 2
      end as rank,
      0 as tiebreak
    from public.posts p
    join public.post_translations pt on pt.post_id = p.id
    cross join params
    where params.pattern is not null
      and p.status = 'published'
      and (p.published_at is null or p.published_at <= now())
      and pt.locale = p_locale
      and pt.is_published
      and (
        public.immutable_unaccent(lower(pt.title)) like params.pattern escape '\'
        or public.immutable_unaccent(lower(coalesce(pt.excerpt, ''))) like params.pattern escape '\'
      )
  ),
  ranked as (
    select h.*, row_number() over (partition by h.kind order by h.rank, h.published_at desc nulls last, h.tiebreak, h.title, h.id) as n
    from (select * from destination_hits union all select * from post_hits) h
  )
  select r.kind, r.id, r.slug, r.title, r.summary, r.published_at
  from ranked r
  cross join params
  where r.n <= params.max_rows
  order by r.kind, r.n
$$;

comment on function public.search_site(public.locale, text, int) is
  'Published destinations and journal articles matching a term in one language (site search).';

revoke execute on function public.search_site(public.locale, text, int) from public;
grant execute on function public.search_site(public.locale, text, int) to anon, authenticated, service_role;
