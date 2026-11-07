-- Phase 6 PR 6B, Stream A backlog (docs/specs/phase-6-hardening-launch.md decision 14) and a
-- Phase 5 review minor.
--
-- * email_logs.failed_at: when a send failed. The email alert windowed failures on created_at,
--   the claim time, so a send that failed more than 15 minutes after its claim (a slow provider, a
--   retry of the outcome update) never alerted. A trigger sets the time on the change to `failed`,
--   so every writer is covered; raise_on_email_problems() now windows on it.
-- * admin_dashboard(): the operations section counts confirmed and completed travellers per
--   departure, as departures_below_minimum() does (Phase 5 PR 5D review).

alter table public.email_logs add column failed_at timestamptz;
update public.email_logs set failed_at = created_at where status = 'failed';

create function public.set_email_failed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'failed' and (tg_op = 'INSERT' or old.status is distinct from 'failed') then
    new.failed_at := coalesce(new.failed_at, now());
  elsif new.status <> 'failed' then
    new.failed_at := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.set_email_failed_at() from public, anon, authenticated;

create trigger email_logs_failed_at
  before insert or update of status, failed_at on public.email_logs
  for each row execute function public.set_email_failed_at();

create index email_logs_failed_at_idx on public.email_logs (failed_at) where failed_at is not null;

-- Same rule and message as *_email_polish.sql, with failures windowed on failed_at. The health
-- check's own alert emails (`cron_alert`) are left out, so a Resend outage cannot feed back into
-- more alerts: it already reports this job's failures (#54 review).
create or replace function public.raise_on_email_problems()
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
   where status = 'queued' and created_at <= now() - interval '10 minutes' and created_at > now() - interval '25 minutes'
     and template <> 'cron_alert';
  select count(*) into failed from public.email_logs
   where status = 'failed' and failed_at > now() - interval '15 minutes' and template <> 'cron_alert';
  if stuck > 0 or failed > 0 then
    raise exception 'email: % stuck in queued, % failed in the last 15 minutes; see email_logs and README "Runbooks"', stuck, failed;
  end if;
end;
$$;

create or replace function public.admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  today date := public.vietnam_today();
  month_start timestamptz := (date_trunc('month', today)::timestamp at time zone 'Asia/Ho_Chi_Minh');
  team boolean;
  result jsonb := '{}'::jsonb;
begin
  if not public.can_act_as('{sales,sales_manager,operator,accountant,editor,admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if public.can_act_as('{sales,sales_manager,admin}') then
    team := public.can_act_as('{sales_manager,admin}');
    result := result || jsonb_build_object('sales', jsonb_build_object(
      'scope', case when team then 'team' else 'own' end,
      'new_bookings', (select count(*) from public.bookings b
                        where b.created_at >= now() - interval '7 days' and b.status <> 'draft'
                          and (team or b.assigned_to = uid)),
      'open_inquiries', (select count(*) from public.inquiries i
                          where i.status in ('new', 'contacted', 'quoted')
                            and (case when team then i.assigned_to is not null else i.assigned_to = uid end)),
      'unassigned_inquiries', (select count(*) from public.inquiries i
                                where i.assigned_to is null and i.status in ('new', 'contacted', 'quoted')),
      'quotes_awaiting_payment', (select count(*) from public.bookings b
                                   where b.type = 'quoted' and b.status in ('quoted', 'pending_payment')
                                     and (team or b.assigned_to = uid)),
      'median_first_response_minutes', (
        select round((percentile_cont(0.5) within group (order by extract(epoch from i.first_responded_at - i.created_at))) / 60)::int
          from public.inquiries i
         where i.created_at >= now() - interval '30 days' and i.first_responded_at is not null
           and (team or i.assigned_to = uid))
    ));
  end if;

  if public.can_act_as('{operator,admin}') then
    result := result || jsonb_build_object('operations', jsonb_build_object(
      'departures', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'id', x.id, 'tour_code', x.code, 'start_date', x.start_date, 'status', x.status,
                 'capacity', x.capacity, 'seats_reserved', x.seats_reserved, 'confirmed', x.confirmed,
                 'party', x.party, 'travellers', x.travellers, 'min_pax', x.min_pax
               ) order by x.start_date, x.code), '[]'::jsonb)
          from (
            select d.id, t.code, d.start_date, d.status, d.capacity, d.seats_reserved, t.min_pax_to_operate as min_pax,
                   coalesce(sum(b.adults + b.children), 0)::int as confirmed,
                   coalesce(sum(b.adults + b.children + b.infants), 0)::int as party,
                   coalesce(sum((select count(*) from public.travellers tr where tr.booking_id = b.id)), 0)::int as travellers
              from public.departures d
              join public.tours t on t.id = d.tour_id
              left join public.bookings b on b.departure_id = d.id and b.status in ('confirmed', 'completed')
             where d.status <> 'cancelled' and d.start_date between today and today + 14
             group by d.id, t.code, t.min_pax_to_operate
             order by d.start_date, t.code
             limit 50
          ) x),
      'below_minimum', jsonb_array_length(public.departures_below_minimum(21)),
      'missing_travellers', (select count(*) from public.bookings b
                              where b.status = 'confirmed' and b.start_date >= today
                                and (select count(*) from public.travellers tr where tr.booking_id = b.id) < b.adults + b.children + b.infants)
    ));
  end if;

  if public.can_act_as('{accountant,admin}') then
    result := result || jsonb_build_object('finance', jsonb_build_object(
      'revenue_month', (select coalesce(sum(case when p.kind = 'refund' then -p.amount else p.amount end), 0)
                          from public.payments p
                         where p.status = 'succeeded' and coalesce(p.paid_at, p.created_at) >= month_start),
      'payments_expiring', (select count(*) from public.payments p
                             where p.status = 'pending' and p.expires_at between now() and now() + interval '30 minutes'),
      'unmatched_transfers', (select count(*) from public.webhook_events w where w.error = 'unmatched'),
      'money_attention', (select count(*) from public.bookings b
                           where (b.needs_attention and coalesce(b.attention_reason, '') <> 'cancel_requested')
                              or (b.status = 'confirmed' and b.payment_state = 'deposit_paid' and b.balance_due_date < today))
    ));
  end if;

  if public.can_act_as('{editor,admin}') then
    result := result || jsonb_build_object('content', jsonb_build_object(
      'drafts', (select (select count(*) from public.tours where status = 'draft')
                      + (select count(*) from public.posts where status = 'draft')
                      + (select count(*) from public.destinations where status = 'draft')
                      + (select count(*) from public.travel_styles where status = 'draft')),
      'missing_translations', (
        select (select count(*) from public.tours x where x.status = 'published'
                  and (select count(*) from public.tour_translations tt where tt.tour_id = x.id and tt.is_published) < 2)
             + (select count(*) from public.posts x where x.status = 'published'
                  and (select count(*) from public.post_translations tt where tt.post_id = x.id and tt.is_published) < 2)
             + (select count(*) from public.destinations x where x.status = 'published'
                  and (select count(*) from public.destination_translations tt where tt.destination_id = x.id and tt.is_published) < 2)
             + (select count(*) from public.travel_styles x where x.status = 'published'
                  and (select count(*) from public.travel_style_translations tt where tt.travel_style_id = x.id and tt.is_published) < 2)
             + (select count(*) from public.pages x where x.status = 'published'
                  and (select count(*) from public.page_translations tt where tt.page_id = x.id and tt.is_published) < 2)),
      'missing_alt', (select count(*) from public.media m
                       where coalesce(trim(m.alt ->> 'vi'), '') = '' or coalesce(trim(m.alt ->> 'en'), '') = '')
    ));
  end if;

  if public.can_act_as('{admin}') then
    result := result || jsonb_build_object('admin', jsonb_build_object(
      'deletion_requests', jsonb_array_length(public.admin_deletion_requests(null))
    ));
  end if;

  return result;
end;
$$;
