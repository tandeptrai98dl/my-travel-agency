-- Phase 4 polish (#36 review): single-use emailed checkout links, staff reads of a booking's email
-- log (for "resend"), and an alert for stuck or failed emails.

-- Single-use access tokens ------------------------------------------------------------------------
-- An emailed checkout link (purpose 'email', 4E) or, from Phase 5, a guest lookup link ('lookup')
-- carries a random token; only its SHA-256 is stored. The customer's click redeems it once and the
-- app sets a fresh access cookie (spec Phase 4 decision 7, ADR-038). Written only by the service
-- role through the functions below.
create table public.booking_access_tokens (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  purpose    text not null check (purpose in ('email', 'lookup')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index booking_access_tokens_booking_id_idx on public.booking_access_tokens (booking_id);
alter table public.booking_access_tokens enable row level security;

-- Admins may inspect them (support); nobody writes through the API.
create policy "booking_access_tokens: admin read" on public.booking_access_tokens
  for select to authenticated
  using ((select public.can_act_as('{admin}')));

create function public.issue_booking_access_token(target_id uuid, purpose text, token_hash text, valid_minutes int)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  expires timestamptz;
begin
  if purpose not in ('email', 'lookup') or token_hash !~ '^[0-9a-f]{64}$' or valid_minutes not between 1 and 10080 then
    raise exception 'invalid_token';
  end if;
  if not exists (select 1 from public.bookings where id = target_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  expires := now() + make_interval(mins => valid_minutes);
  insert into public.booking_access_tokens (booking_id, purpose, token_hash, expires_at)
  values (target_id, issue_booking_access_token.purpose, issue_booking_access_token.token_hash, expires);
  return expires;
end;
$$;

-- What the link page shows before the click (no side effects): valid, used, expired or invalid.
-- The token must belong to the booking named in the URL.
create function public.booking_access_token_state(target_code text, token_hash text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when t.id is null then 'invalid'
    when t.used_at is not null then 'used'
    when t.expires_at <= now() then 'expired'
    else 'valid'
  end
  from (select 1) one
  left join (
    public.booking_access_tokens t join public.bookings b on b.id = t.booking_id and b.code = target_code
  ) on t.token_hash = booking_access_token_state.token_hash
$$;

-- The customer's click: used once, before its expiry, for the booking named in the URL.
create function public.redeem_booking_access_token(target_code text, token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.booking_access_tokens;
  b public.bookings;
begin
  select tok.* into t from public.booking_access_tokens tok
   join public.bookings bk on bk.id = tok.booking_id and bk.code = target_code
   where tok.token_hash = redeem_booking_access_token.token_hash
   for update of tok;
  if not found then
    raise exception 'link_invalid';
  end if;
  if t.used_at is not null then
    raise exception 'link_used';
  end if;
  if t.expires_at <= now() then
    raise exception 'link_expired';
  end if;
  update public.booking_access_tokens set used_at = now() where id = t.id;
  select * into b from public.bookings where id = t.booking_id;
  return jsonb_build_object('booking_id', b.id, 'code', b.code, 'locale', b.locale);
end;
$$;

-- Staff who read bookings see the emails sent about them ("resend", 4F) ----------------------------
create policy "email_logs: booking staff read" on public.email_logs
  for select to authenticated
  using (
    booking_id is not null
    and (select public.can_act_as('{sales,sales_manager,operator,accountant,admin}'))
  );

-- Alert on stuck or failed emails (ARCHITECTURE.md "Monitoring": a failed pg_cron run alerts) ------
-- Every 15 minutes: a row still `queued` 10–25 minutes after it was claimed (the sender died between
-- the claim and the outcome), or a row that `failed` in the last 15 minutes. Each problem fails one
-- run (the windows do not overlap), so an alert is raised once per problem, not forever.
create function public.raise_on_email_problems()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  stuck int;
  failed int;
begin
  select count(*) into stuck from public.email_logs
   where status = 'queued' and created_at <= now() - interval '10 minutes' and created_at > now() - interval '25 minutes';
  select count(*) into failed from public.email_logs
   where status = 'failed' and created_at > now() - interval '15 minutes';
  if stuck > 0 or failed > 0 then
    raise exception 'email: % stuck in queued, % failed in the last 15 minutes; see email_logs and README "Runbooks"', stuck, failed;
  end if;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.issue_booking_access_token(uuid, text, text, int)',
    'public.booking_access_token_state(text, text)',
    'public.redeem_booking_access_token(text, text)',
    'public.raise_on_email_problems()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed; the email alert is not scheduled';
    return;
  end if;
  perform cron.schedule('email-problems-alert', '*/15 * * * *', 'select public.raise_on_email_problems()');
end;
$$;
