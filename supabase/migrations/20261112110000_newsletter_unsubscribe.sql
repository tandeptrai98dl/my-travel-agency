-- Newsletter withdrawal (docs/specs/phase-6-hardening-launch.md decision 7, ADR-029): withdrawing
-- consent must be as easy as giving it.
--
-- Every newsletter email carries an unsubscribe link with a single-use token. Campaigns are sent by
-- the owner from Resend's broadcast tool, from the audited subscriber export (ADR-031); the export
-- issues a fresh token per subscriber and puts the link in the file as a merge column. Only the
-- SHA-256 of each token is stored, here, so a link in an older campaign keeps working until it is
-- used. The page unsubscribes on a button press, never on a plain visit, through
-- `unsubscribe_newsletter()`, which sets `subscribers.unsubscribed_at` and records the withdrawal
-- in `consent_records` in one transaction.

create table public.newsletter_unsubscribe_tokens (
  id            uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.subscribers (id) on delete cascade,
  token_hash    text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at    timestamptz not null default now(),
  used_at       timestamptz
);

comment on table public.newsletter_unsubscribe_tokens is
  'SHA-256 of the single-use unsubscribe tokens issued with each subscriber export (service role only).';

create index newsletter_unsubscribe_tokens_subscriber_idx on public.newsletter_unsubscribe_tokens (subscriber_id);

alter table public.newsletter_unsubscribe_tokens enable row level security;
-- No policy and no privilege for any API role: only the service-role functions below use it.
revoke all on table public.newsletter_unsubscribe_tokens from public, anon, authenticated;

-- Stores one token hash per subscriber of an export, for active subscribers only (confirmed, not
-- unsubscribed); other ids are skipped. Called by the export after `requirePermission()` and its
-- audit row. Returns the number of tokens stored.
create or replace function public.issue_newsletter_unsubscribe_tokens(p_subscriber_ids uuid[], p_token_hashes text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_subscriber_ids is null or p_token_hashes is null
     or coalesce(array_length(p_subscriber_ids, 1), 0) <> coalesce(array_length(p_token_hashes, 1), 0) then
    raise exception 'ids and hashes must pair up' using errcode = '22023';
  end if;
  if coalesce(array_length(p_subscriber_ids, 1), 0) > 1000 then
    raise exception 'at most 1000 tokens per call' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_token_hashes) as hash where hash is null or hash !~ '^[0-9a-f]{64}$') then
    raise exception 'invalid token hash' using errcode = '22023';
  end if;

  insert into public.newsletter_unsubscribe_tokens (subscriber_id, token_hash)
  select s.id, pair.hash
    from unnest(p_subscriber_ids, p_token_hashes) as pair (subscriber_id, hash)
    join public.subscribers s on s.id = pair.subscriber_id
   where s.confirmed_at is not null and s.unsubscribed_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.issue_newsletter_unsubscribe_tokens(uuid[], text[]) is
  'Stores the hashes of fresh unsubscribe tokens for active subscribers (the audited export; service role only).';

-- The button press. Returns 'unsubscribed' (done now), 'already' (the subscriber had already
-- left; the token is spent) or 'invalid' (unknown or used token). The withdrawal is recorded as a
-- `marketing` consent with `granted = false` and the document version `newsletter-unsubscribe`.
create or replace function public.unsubscribe_newsletter(p_token_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token_id uuid;
  v_subscriber_id uuid;
  v_email text;
  v_unsubscribed_at timestamptz;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return 'invalid';
  end if;

  update public.newsletter_unsubscribe_tokens
     set used_at = now()
   where token_hash = p_token_hash and used_at is null
  returning id, subscriber_id into v_token_id, v_subscriber_id;
  if v_token_id is null then
    return 'invalid';
  end if;

  select email, unsubscribed_at into v_email, v_unsubscribed_at
    from public.subscribers
   where id = v_subscriber_id
     for update;
  if v_unsubscribed_at is not null then
    return 'already';
  end if;

  update public.subscribers set unsubscribed_at = now() where id = v_subscriber_id;
  insert into public.consent_records (subject_email, purpose, granted, document_version)
  values (v_email, 'marketing', false, 'newsletter-unsubscribe');
  return 'unsubscribed';
end;
$$;

comment on function public.unsubscribe_newsletter(text) is
  'Newsletter withdrawal by single-use token (service role only): sets unsubscribed_at and records the withdrawal in one transaction.';

revoke execute on function public.issue_newsletter_unsubscribe_tokens(uuid[], text[]) from public, anon, authenticated;
grant execute on function public.issue_newsletter_unsubscribe_tokens(uuid[], text[]) to service_role;
revoke execute on function public.unsubscribe_newsletter(text) from public, anon, authenticated;
grant execute on function public.unsubscribe_newsletter(text) to service_role;
