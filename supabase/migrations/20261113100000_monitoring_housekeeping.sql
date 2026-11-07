-- Monitoring and housekeeping (docs/specs/phase-6-hardening-launch.md decisions 3 and 4, PR 6B).
--
-- * cron_failures(since): failed pg_cron runs since a time, and jobs that missed their schedule,
--   for the /api/cron/health-checks route (which emails the team once per row, ADR-036).
-- * cron_job_overdue(): the missed-run rule (3 intervals for jobs every N minutes or hourly, 26 h
--   for daily jobs).
-- * cleanup_booking_access_tokens(), trim_webhook_payloads(), purge_cron_history(): daily
--   housekeeping, scheduled below where pg_cron exists (as in *_booking_cron.sql).
--
-- Everything is service role only. Without pg_cron (the local shim) the cron functions return
-- nothing and no job is scheduled.

-- The missed-run rule -------------------------------------------------------------------------------
-- `reference` is the last successful start, or the first recorded start of a job that never
-- succeeded; a job without any recorded run is not judged (nothing says when it should have run).
-- Schedules other than "every N minutes", hourly and daily are not judged either.
create function public.cron_job_overdue(schedule text, reference timestamptz, at timestamptz)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  parts text[] := regexp_split_to_array(btrim(schedule), '\s+');
  allowed interval;
begin
  if reference is null or array_length(parts, 1) <> 5 or parts[3] <> '*' or parts[4] <> '*' or parts[5] <> '*' then
    return false;
  end if;
  if parts[2] = '*' and parts[1] = '*' then
    allowed := interval '3 minutes';
  elsif parts[2] = '*' and parts[1] ~ '^\*/[0-9]{1,2}$' then
    allowed := 3 * make_interval(mins => substr(parts[1], 3)::int);
  elsif parts[2] = '*' and parts[1] ~ '^[0-9]{1,2}$' then
    allowed := interval '3 hours';
  elsif parts[1] ~ '^[0-9]{1,2}$' and parts[2] ~ '^[0-9]{1,2}$' then
    allowed := interval '26 hours';
  else
    return false;
  end if;
  return reference < at - allowed;
end;
$$;

-- Failed and missed runs ----------------------------------------------------------------------------
-- kind 'failed': one row per failed run started at or after `since` (run_at = its start; the
-- message is pg_cron's return message, cut to 500 characters: our alert jobs raise counts only).
-- kind 'missed': one row per active job that is overdue now (run_at = its last successful start,
-- null when it never succeeded). The health check keys its emails on (kind, job, run_at), so a
-- failed run alerts once and a missed job alerts once per gap.
create function public.cron_failures(since timestamptz)
returns table (kind text, job_name text, run_at timestamptz, message text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if to_regclass('cron.job_run_details') is null or to_regclass('cron.job') is null then
    return;
  end if;
  return query
    select 'failed'::text, coalesce(j.jobname, 'job ' || d.jobid::text), d.start_time, left(coalesce(d.return_message, ''), 500)
      from cron.job_run_details d
      left join cron.job j on j.jobid = d.jobid
     where d.status = 'failed' and d.start_time >= since
    union all
    select 'missed'::text, coalesce(j.jobname, 'job ' || j.jobid::text), s.last_success, null::text
      from cron.job j
      cross join lateral (
        select max(r.start_time) filter (where r.status = 'succeeded') as last_success, min(r.start_time) as first_start
          from cron.job_run_details r
         where r.jobid = j.jobid
      ) s
     where j.active and public.cron_job_overdue(j.schedule, coalesce(s.last_success, s.first_start), now())
     order by 3 nulls first, 2;
end;
$$;

-- Housekeeping ----------------------------------------------------------------------------------------
-- Emailed checkout and lookup tokens (ADR-038) a month after they were used or expired, whichever
-- came first. Returns the number deleted.
create function public.cleanup_booking_access_tokens()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed int;
begin
  delete from public.booking_access_tokens t
   where least(coalesce(t.used_at, 'infinity'::timestamptz), t.expires_at) < now() - interval '30 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- Webhook payloads after 400 days, only where the payload is already copied into
-- payments.raw_response (decision 4). The rows stay as idempotency proof (provider, key, times).
-- record_payment_event() marks its outcomes on webhook_events.error:
--   null + processed_at set   a payment was recorded (the payload is its raw_response)  -> trimmed
--   'duplicate_transaction'   the gateway transaction was already recorded               -> trimmed
--   'assigned'                an unmatched transfer assigned later by an accountant; the
--                             'assigned:<id>' event recorded the payment with this payload -> trimmed
--   'unmatched'               waiting for assign_unmatched_transfer(), which reads the amount
--                             from the payload                                             -> never
--   'failed', 'invalid_amount' or anything else                                           -> never
--   processed_at null         never finished                                               -> never
create function public.trim_webhook_payloads()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  trimmed int;
begin
  update public.webhook_events w
     set payload = '{}'::jsonb
   where w.received_at < now() - interval '400 days'
     and w.processed_at is not null
     and (w.error is null or w.error in ('duplicate_transaction', 'assigned'))
     and w.payload <> '{}'::jsonb;
  get diagnostics trimmed = row_count;
  return trimmed;
end;
$$;

-- pg_cron's run history older than 30 days (the table never shrinks on its own).
create function public.purge_cron_history()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed int;
begin
  if to_regclass('cron.job_run_details') is null then
    return 0;
  end if;
  delete from cron.job_run_details d where coalesce(d.end_time, d.start_time) < now() - interval '30 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.cron_job_overdue(text, timestamptz, timestamptz)',
    'public.cron_failures(timestamptz)',
    'public.cleanup_booking_access_tokens()',
    'public.trim_webhook_payloads()',
    'public.purge_cron_history()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

comment on function public.cron_failures(timestamptz) is
  'Failed pg_cron runs since a time and overdue jobs (service role; empty without pg_cron), for /api/cron/health-checks.';
comment on function public.trim_webhook_payloads() is
  'Daily: empties webhook payloads older than 400 days that are copied into payments.raw_response; never unmatched or error rows.';

-- Schedules (UTC; 20:05, 20:20 and 20:35 UTC are 03:05, 03:20 and 03:35 in Vietnam) -----------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed; housekeeping jobs are not scheduled';
    return;
  end if;
  perform cron.schedule('booking-tokens-cleanup', '5 20 * * *', 'select public.cleanup_booking_access_tokens()');
  perform cron.schedule('webhook-payload-trim', '20 20 * * *', 'select public.trim_webhook_payloads()');
  perform cron.schedule('cron-history-purge', '35 20 * * *', 'select public.purge_cron_history()');
end;
$$;
