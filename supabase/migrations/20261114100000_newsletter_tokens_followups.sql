-- Newsletter unsubscribe tokens, #55 review backlog (docs/specs/phase-6-hardening-launch.md
-- decision 7, PR 6P step 10a):
-- m5: spent tokens and tokens nobody used for 24 months are purged daily, so the table does not
--     keep a row per subscriber per export for ever.
-- m6: `issue_newsletter_unsubscribe_tokens()` returns the subscribers that got a token, so the
--     export can drop a subscriber who unsubscribed between its read and the issue (they would
--     otherwise get a row with no working link, and a campaign they no longer agreed to).

-- m5 ------------------------------------------------------------------------------------------
-- A spent token can never be used again (`unsubscribe_newsletter()` only takes unused ones, and
-- answers a spent one as `invalid`), so removing it changes no answer. An unused token older than
-- 24 months belongs to a campaign long past; its subscriber can still leave through any newer
-- campaign's link (each export issues a fresh one) or by asking. Returns the number of rows removed.
create or replace function public.purge_newsletter_unsubscribe_tokens()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.newsletter_unsubscribe_tokens
   where used_at is not null
      or created_at < now() - interval '24 months';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.purge_newsletter_unsubscribe_tokens() is
  'Deletes spent newsletter unsubscribe tokens and unused ones older than 24 months (pg_cron, daily).';

revoke execute on function public.purge_newsletter_unsubscribe_tokens() from public, anon, authenticated;
grant execute on function public.purge_newsletter_unsubscribe_tokens() to service_role;

-- Daily at 20:25 UTC (03:25 in Vietnam; the other housekeeping jobs run at :05, :10, :20 and :35),
-- only where pg_cron exists (as the other jobs). Missed or failed runs alert through cron_failures().
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed; newsletter-tokens-purge is not scheduled';
    return;
  end if;
  perform cron.schedule('newsletter-tokens-purge', '25 20 * * *', 'select public.purge_newsletter_unsubscribe_tokens()');
end;
$$;

-- m6 ------------------------------------------------------------------------------------------
-- Same checks and inserts as before; the result changes from a count to the ids of the
-- subscribers that got a token (active ones only), so the return type needs a drop and create.
drop function public.issue_newsletter_unsubscribe_tokens(uuid[], text[]);

create function public.issue_newsletter_unsubscribe_tokens(p_subscriber_ids uuid[], p_token_hashes text[])
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_issued uuid[];
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

  with issued as (
    insert into public.newsletter_unsubscribe_tokens (subscriber_id, token_hash)
    select s.id, pair.hash
      from unnest(p_subscriber_ids, p_token_hashes) as pair (subscriber_id, hash)
      join public.subscribers s on s.id = pair.subscriber_id
     where s.confirmed_at is not null and s.unsubscribed_at is null
    returning subscriber_id
  )
  select coalesce(array_agg(subscriber_id), '{}') into v_issued from issued;
  return v_issued;
end;
$$;

comment on function public.issue_newsletter_unsubscribe_tokens(uuid[], text[]) is
  'Stores the hashes of fresh unsubscribe tokens for active subscribers and returns their ids (the audited export; service role only).';

revoke execute on function public.issue_newsletter_unsubscribe_tokens(uuid[], text[]) from public, anon, authenticated;
grant execute on function public.issue_newsletter_unsubscribe_tokens(uuid[], text[]) to service_role;
