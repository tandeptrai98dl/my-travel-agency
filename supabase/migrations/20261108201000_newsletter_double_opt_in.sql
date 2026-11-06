-- Newsletter double opt-in (Phase 3 PR I; ARCHITECTURE.md "Guest writes"). Two functions for the
-- service role only: the Server Action calls them after Zod, Turnstile and a rate limit. No table,
-- policy or grant changes: `subscribers` stays staff-read-only for API roles (Stream A's admin).
--
-- Tokens: the action sends a random token by email and stores only its SHA-256 (hex). The token
-- carries its issue time, which the action checks (7 days) before calling confirm; the hash covers
-- it, so the time cannot be altered.

-- Requests a subscription. Returns true when a confirmation email should be sent: a new address,
-- one not yet confirmed (a fresh token replaces the old one) or one that unsubscribed. An active
-- subscriber is left untouched and gets no email, without telling the caller (no address probing).
create or replace function public.request_newsletter_subscription(
  p_email text,
  p_locale public.locale,
  p_source text,
  p_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_id uuid;
begin
  if v_email is null or length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid token hash' using errcode = '22023';
  end if;
  if p_locale is null then
    raise exception 'locale required' using errcode = '22023';
  end if;

  insert into public.subscribers (email, locale, source, confirm_token_hash)
  values (v_email, p_locale, left(nullif(btrim(p_source), ''), 40), p_token_hash)
  on conflict (email) do update
    set confirm_token_hash = excluded.confirm_token_hash,
        locale = excluded.locale
    where public.subscribers.confirmed_at is null
       or public.subscribers.unsubscribed_at is not null
  returning id into v_id;

  return v_id is not null;
end;
$$;

comment on function public.request_newsletter_subscription(text, public.locale, text, text) is
  'Newsletter double opt-in, step 1 (service role only): stores the token hash; true when a confirmation email should be sent.';

-- Confirms a subscription by token hash, once: sets confirmed_at, clears an earlier unsubscribe
-- and the token, and records the marketing consent (Decree 13/2023 proof of consent) in the same
-- transaction. Returns false for an unknown or already used token.
create or replace function public.confirm_newsletter_subscription(
  p_token_hash text,
  p_document_version text,
  p_ip inet default null,
  p_user_agent text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_email text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  if p_document_version is null or btrim(p_document_version) = '' then
    raise exception 'document version required' using errcode = '22023';
  end if;

  update public.subscribers
     set confirmed_at = now(),
         unsubscribed_at = null,
         confirm_token_hash = null
   where confirm_token_hash = p_token_hash
  returning id, email into v_id, v_email;

  if v_id is null then
    return false;
  end if;

  insert into public.consent_records (subject_email, purpose, granted, document_version, ip, user_agent)
  values (v_email, 'marketing', true, p_document_version, p_ip, left(p_user_agent, 500));

  return true;
end;
$$;

comment on function public.confirm_newsletter_subscription(text, text, inet, text) is
  'Newsletter double opt-in, step 2 (service role only): confirms once and records the marketing consent.';

revoke execute on function public.request_newsletter_subscription(text, public.locale, text, text) from public, anon, authenticated;
grant execute on function public.request_newsletter_subscription(text, public.locale, text, text) to service_role;
revoke execute on function public.confirm_newsletter_subscription(text, text, inet, text) from public, anon, authenticated;
grant execute on function public.confirm_newsletter_subscription(text, text, inet, text) to service_role;

-- Token lookups on confirm.
create index if not exists subscribers_confirm_token_hash_idx on public.subscribers (confirm_token_hash)
  where confirm_token_hash is not null;
