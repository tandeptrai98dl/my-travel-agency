-- Newsletter unsubscribe tokens, #55 review backlog (*_newsletter_tokens_followups.sql): the daily
-- purge of spent and 24-month-old tokens, its pg_cron schedule, and the issue function returning
-- the subscribers that got a token.
begin;
select plan(11);

-- Purge: locked down ---------------------------------------------------------------------------
select ok(
  (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.purge_newsletter_unsubscribe_tokens()'::regprocedure),
  'the purge is security definer with an empty search_path'
);
select ok(
  not has_function_privilege('anon', 'public.purge_newsletter_unsubscribe_tokens()', 'execute')
    and not has_function_privilege('authenticated', 'public.purge_newsletter_unsubscribe_tokens()', 'execute')
    and has_function_privilege('service_role', 'public.purge_newsletter_unsubscribe_tokens()', 'execute'),
  'only the service role (and pg_cron) runs the purge'
);
select ok(
  (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.issue_newsletter_unsubscribe_tokens(uuid[], text[])'::regprocedure)
    and not has_function_privilege('anon', 'public.issue_newsletter_unsubscribe_tokens(uuid[], text[])', 'execute')
    and not has_function_privilege('authenticated', 'public.issue_newsletter_unsubscribe_tokens(uuid[], text[])', 'execute')
    and has_function_privilege('service_role', 'public.issue_newsletter_unsubscribe_tokens(uuid[], text[])', 'execute'),
  'the recreated issue function keeps its definer settings and service-role-only grant'
);

create function pg_temp.purge_job()
returns int
language plpgsql
as $$
declare
  jobs int;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return 1;
  end if;
  execute $sql$select count(*)::int from cron.job where jobname = 'newsletter-tokens-purge'
    and command = 'select public.purge_newsletter_unsubscribe_tokens()'$sql$ into jobs;
  return jobs;
end;
$$;
select is(pg_temp.purge_job(), 1, 'the purge is scheduled daily where pg_cron exists');

-- Fixtures: two active subscribers, one who left.
insert into public.subscribers (id, email, locale, confirmed_at, unsubscribed_at) values
  ('b0000000-0000-4000-8000-000000000001', 'stays@example.com', 'vi', now() - interval '3 years', null),
  ('b0000000-0000-4000-8000-000000000002', 'also@example.com', 'en', now() - interval '3 years', null),
  ('b0000000-0000-4000-8000-000000000003', 'gone@example.com', 'en', now() - interval '3 years', now() - interval '1 day');

-- Issue: returns the ids that got a token -------------------------------------------------------
select is(
  (select array_agg(issued order by issued)
     from unnest(public.issue_newsletter_unsubscribe_tokens(
       array['b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002']::uuid[],
       array[repeat('a', 64), repeat('b', 64), repeat('c', 64)]
     )) as issued),
  array['b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002']::uuid[],
  'exactly the active subscribers are returned (the one who left is not)'
);
select is(
  (select count(*)::int from public.newsletter_unsubscribe_tokens where subscriber_id = 'b0000000-0000-4000-8000-000000000003'),
  0,
  'a subscriber who left gets no token, so the export drops their row'
);
select is(
  public.issue_newsletter_unsubscribe_tokens(array['b0000000-0000-4000-8000-000000000003']::uuid[], array[repeat('d', 64)]),
  '{}'::uuid[],
  'nobody active: an empty list, not null'
);

-- Purge: what goes and what stays ----------------------------------------------------------------
-- 'a' spent yesterday; 'c' unused and recent; 'e' unused, 25 months old; 'f' unused, 23 months old;
-- 'g' spent 3 years ago.
update public.newsletter_unsubscribe_tokens set used_at = now() - interval '1 day' where token_hash = repeat('a', 64);
insert into public.newsletter_unsubscribe_tokens (subscriber_id, token_hash, created_at, used_at) values
  ('b0000000-0000-4000-8000-000000000002', repeat('e', 64), now() - interval '25 months', null),
  ('b0000000-0000-4000-8000-000000000002', repeat('f', 64), now() - interval '23 months', null),
  ('b0000000-0000-4000-8000-000000000001', repeat('9', 64), now() - interval '3 years', now() - interval '3 years');

select is(public.purge_newsletter_unsubscribe_tokens(), 3, 'spent tokens and unused ones older than 24 months are removed');
select is(
  (select array_agg(left(token_hash, 1) order by token_hash) from public.newsletter_unsubscribe_tokens
    where subscriber_id in ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002')),
  array['c', 'f'],
  'unused tokens younger than 24 months stay'
);
select is(public.unsubscribe_newsletter(repeat('f', 64)), 'unsubscribed', 'a kept token still works');
select is(public.purge_newsletter_unsubscribe_tokens(), 1, 'it is spent now, and the next run removes it');

select * from finish();
rollback;
