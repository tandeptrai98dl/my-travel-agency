-- Redirects (docs/specs/phase-2-catalog-admin.md step 20, decisions 4 and 5, ADR-031). The table
-- is the source of truth; the proxy (Phase 3) reads its copy in Redis. Paths are site-relative,
-- so a redirect never sends visitors to another site, and chains are refused so the proxy needs
-- one lookup.

alter table public.redirects
  add constraint redirects_from_path_format check (
    from_path ~ '^/[^/\\\s]' and from_path !~ '[\s#?\\]' and char_length(from_path) <= 500
  ),
  add constraint redirects_to_path_format check (
    to_path ~ '^/([^/\\\s]|$)' and to_path !~ '[\s\\]' and char_length(to_path) <= 500
  ),
  add constraint redirects_not_to_itself check (from_path <> to_path),
  add constraint redirects_status_code check (status_code in (301, 302, 307, 308));

-- No chains: a target is never itself redirected, and a redirected path is never a target.
-- (The slug-change helpers flatten existing chains before they write, in that order.)
create function public.check_redirect_chain()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.redirects r where r.from_path = new.to_path and r.id <> new.id) then
    raise exception 'the target is itself redirected' using errcode = '23514';
  end if;
  if exists (select 1 from public.redirects r where r.to_path = new.from_path and r.id <> new.id) then
    raise exception 'other redirects point to this path' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_redirect_chain
  before insert or update of from_path, to_path on public.redirects
  for each row execute function public.check_redirect_chain();
