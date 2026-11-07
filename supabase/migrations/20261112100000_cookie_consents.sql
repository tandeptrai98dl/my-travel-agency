-- Proof of cookie consent (docs/specs/phase-6-hardening-launch.md decision 7, ADR-039).
--
-- The `consent` cookie alone is not proof (Decree 13/2023 asks the controller to show that consent
-- was given), and `consent_records` needs an email address, which a cookie choice does not have.
-- Each choice made in the banner or the settings dialog becomes one row here, written by a
-- rate-limited Server Action through `record_cookie_consent()` with the service role.
--
-- `id` is a random UUID kept in the visitor's `consent` cookie: a pseudonymous identifier, never
-- sent to Google Analytics, Sentry or the logs. A changed choice is a new row with the same `id`,
-- so the table has its own key (`record_id`). There is no IP address, user agent or account link.
-- API roles have no policy and no privilege on the table; rows older than five years are purged
-- by a daily pg_cron job (retention to be confirmed by counsel, owner item 4a).

create table public.cookie_consents (
  record_id      bigint generated always as identity primary key,
  id             uuid not null,
  action         text not null check (action in ('accept_all', 'essential_only', 'custom', 'withdraw')),
  choices        jsonb not null,
  banner_version text not null check (banner_version ~ '^banner-(vi|en)-[0-9a-f]{16}$'),
  locale         public.locale not null,
  created_at     timestamptz not null default now(),
  -- Exactly the two optional categories, as booleans.
  constraint cookie_consents_choices_shape check (
    jsonb_typeof(choices) = 'object'
    and choices ?& array['analytics', 'marketing']
    and choices - 'analytics' - 'marketing' = '{}'::jsonb
    and jsonb_typeof(choices -> 'analytics') = 'boolean'
    and jsonb_typeof(choices -> 'marketing') = 'boolean'
  ),
  -- The action names what the visitor pressed; it must agree with what was stored.
  constraint cookie_consents_action_matches check (
    case action
      when 'accept_all' then choices = '{"analytics": true, "marketing": true}'::jsonb
      when 'essential_only' then choices = '{"analytics": false, "marketing": false}'::jsonb
      when 'withdraw' then choices = '{"analytics": false, "marketing": false}'::jsonb
      else true
    end
  )
);

comment on table public.cookie_consents is
  'Cookie-consent choices (ADR-039): pseudonymous id from the consent cookie, no IP, user agent or account; service role only; purged after 5 years.';

create index cookie_consents_id_idx on public.cookie_consents (id, created_at);
create index cookie_consents_created_at_idx on public.cookie_consents (created_at);

alter table public.cookie_consents enable row level security;
-- No policy for any API role, and no privilege either: only the service role (which bypasses RLS)
-- and the definer function below touch the table.
revoke all on table public.cookie_consents from public, anon, authenticated;

-- Records one choice. The Server Action has validated the input with Zod and passed the rate limit;
-- the checks here repeat the shape so nothing else can be stored.
create or replace function public.record_cookie_consent(
  p_id uuid,
  p_action text,
  p_analytics boolean,
  p_marketing boolean,
  p_banner_version text,
  p_locale public.locale
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_id is null or p_locale is null or p_analytics is null or p_marketing is null then
    raise exception 'missing value' using errcode = '22023';
  end if;
  insert into public.cookie_consents (id, action, choices, banner_version, locale)
  values (p_id, p_action, jsonb_build_object('analytics', p_analytics, 'marketing', p_marketing), p_banner_version, p_locale);
end;
$$;

comment on function public.record_cookie_consent(uuid, text, boolean, boolean, text, public.locale) is
  'Records one cookie-consent choice (service role only; the consent Server Action calls it after Zod and a rate limit).';

revoke execute on function public.record_cookie_consent(uuid, text, boolean, boolean, text, public.locale) from public, anon, authenticated;
grant execute on function public.record_cookie_consent(uuid, text, boolean, boolean, text, public.locale) to service_role;

-- The purge, as a function so pgTAP can run it without pg_cron. Returns the number of rows removed.
create or replace function public.purge_cookie_consents()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.cookie_consents where created_at < now() - interval '5 years';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.purge_cookie_consents() is
  'Deletes cookie-consent rows older than 5 years (pg_cron, daily).';

revoke execute on function public.purge_cookie_consents() from public, anon, authenticated;
grant execute on function public.purge_cookie_consents() to service_role;

-- Daily at 20:10 UTC (03:10 in Vietnam), only where pg_cron exists (as the Phase 4 jobs).
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed; cookie-consents-purge is not scheduled';
    return;
  end if;
  perform cron.schedule('cookie-consents-purge', '10 20 * * *', 'select public.purge_cookie_consents()');
end;
$$;
