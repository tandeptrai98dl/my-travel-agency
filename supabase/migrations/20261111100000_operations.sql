-- Operations (Phase 5 PR 5D, spec decisions 11, 13, 14 and 16, ADR-037).
--
-- * departures_below_minimum(): departures within N days whose confirmed adults + children are
--   below the tour's minimum to operate (the departure-checks job and the dashboard).
-- * admin_dashboard(): one read per role for /admin, sections by role (can_act_as()).
-- * customer_deletion_blockers(): the read-only half of request_customer_deletion(), which now
--   calls it; admin_deletion_requests() lists open requests with their blockers (admin at aal2);
--   admin_anonymise_customer() refuses while a blocker remains.
-- * export_departure_passengers(): the passenger list of a departure for operators and admins,
--   written to audit_logs in the same transaction before any row is returned.
-- * customer_data_export(): the personal-data export (service role, after the admin check in the
--   app); customer_consents(): consent history for staff who read customers.
-- Dates are Vietnam dates (vietnam_today()). Every function: security definer, search_path ''.

-- Departures below their minimum ----------------------------------------------------------------
create function public.departures_below_minimum(within_days int default 21)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'departure_id', x.id,
           'tour_id', x.tour_id,
           'tour_code', x.code,
           'start_date', x.start_date,
           'days_left', x.start_date - public.vietnam_today(),
           'confirmed', x.confirmed,
           'min_pax', x.min_pax
         ) order by x.start_date, x.code), '[]'::jsonb)
    from (
      select d.id, d.tour_id, t.code, d.start_date, t.min_pax_to_operate as min_pax,
             coalesce((select sum(b.adults + b.children) from public.bookings b
                        where b.departure_id = d.id and b.status in ('confirmed', 'completed')), 0)::int as confirmed
        from public.departures d
        join public.tours t on t.id = d.tour_id
       where d.status in ('open', 'closed')
         and t.min_pax_to_operate is not null
         and d.start_date between public.vietnam_today() and public.vietnam_today() + greatest(coalesce(within_days, 21), 0)
    ) x
   where x.confirmed < x.min_pax
$$;

-- Deletion blockers (read only) -----------------------------------------------------------------
-- Why a customer's deletion must wait: a journey ahead, a payment in progress, a balance due or an
-- open money reason in the attention queue, by the account's bookings and those with its
-- confirmed address (spec decision 8).
create function public.customer_deletion_blockers(target_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with address as (select public.confirmed_customer_email(target_id) as email),
  mine as (
    select b.* from public.bookings b, address a
     where b.customer_id = target_id or (a.email is not null and lower(b.contact_email) = a.email)
  )
  select coalesce(array_agg(distinct reason order by reason), '{}')
    from (
      select case
               when status = 'pending_payment' then 'open_payment'
               when status = 'confirmed' and amount_paid < total then 'balance_due'
               when status in ('quoted', 'confirmed') and start_date >= public.vietnam_today() then 'upcoming_trip'
             end as reason
        from mine
      union all
      select 'attention' from mine where needs_attention and coalesce(attention_reason, '') <> 'cancel_requested'
    ) r
   where reason is not null
$$;

create or replace function public.request_customer_deletion(target_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where id = target_id for update;
  if not found or p.role <> 'customer' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p.deletion_requested_at is null then
    update public.profiles set deletion_requested_at = now() where id = p.id;
  end if;
  return public.customer_deletion_blockers(p.id);
end;
$$;

-- An admin finishes a waiting request only once nothing blocks it any more (the SQL step; the
-- Auth steps run in the account service). A retry after the SQL step changes nothing here.
create or replace function public.admin_anonymise_customer(target_id uuid, note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_note text;
  counts jsonb;
  p public.profiles;
begin
  if not public.can_act_as('{admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  clean_note := public.require_note(note);
  select * into p from public.profiles where id = target_id and role = 'customer' and deletion_requested_at is not null for update;
  if not found then
    raise exception 'not_requested' using errcode = 'P0002';
  end if;
  if p.deleted_at is null and cardinality(public.customer_deletion_blockers(target_id)) > 0 then
    raise exception 'blocked' using errcode = '55000';
  end if;
  counts := public.anonymise_customer(target_id);
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, changes)
  values (auth.uid(), 'customers.anonymise_by_admin', 'profiles', target_id, jsonb_build_object('note', clean_note, 'counts', counts));
  return counts;
end;
$$;

-- Open deletion requests: requested, and the profile or the Auth user not yet deleted. auth.users
-- is not readable by API roles, so its state comes from here. Admin at aal2 only; optionally one.
create function public.admin_deletion_requests(target_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_act_as('{admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id,
             'email', p.email,
             'full_name', p.full_name,
             'requested_at', p.deletion_requested_at,
             'profile_deleted', p.deleted_at is not null,
             'auth_deleted', coalesce(u.deleted_at is not null, true),
             'blockers', to_jsonb(case when p.deleted_at is null then public.customer_deletion_blockers(p.id) else '{}'::text[] end)
           ) order by p.deletion_requested_at), '[]'::jsonb)
      from public.profiles p
      left join auth.users u on u.id = p.id
     where p.role = 'customer'
       and p.deletion_requested_at is not null
       and (p.deleted_at is null or (u.id is not null and u.deleted_at is null))
       and (admin_deletion_requests.target_id is null or p.id = admin_deletion_requests.target_id)
  );
end;
$$;

-- Dashboard per role (spec decision 13) --------------------------------------------------------
create function public.admin_dashboard()
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
              left join public.bookings b on b.departure_id = d.id and b.status = 'confirmed'
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

-- Passenger list (spec decision 14) -------------------------------------------------------------
-- Travellers of the departure's confirmed and completed bookings; a booking without traveller
-- details yet shows its contact as the lead. No passport numbers exist (ADR-016). The audit row
-- is written first, in the same transaction: no row, no list.
create function public.export_departure_passengers(target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  rows jsonb;
begin
  if not public.can_act_as('{operator,admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.departures where id = target_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select coalesce(jsonb_agg(r order by r ->> 'booking_code', (r ->> 'is_lead')::boolean desc, r ->> 'full_name'), '[]'::jsonb) into rows
    from (
      select jsonb_build_object(
               'full_name', tr.full_name,
               'date_of_birth', tr.date_of_birth,
               'nationality', tr.nationality,
               'dietary_notes', tr.dietary_notes,
               'booking_code', b.code,
               'is_lead', tr.is_lead,
               'phone', case when tr.is_lead then b.contact_phone end,
               'party', b.adults + b.children + b.infants
             ) as r
        from public.bookings b
        join public.travellers tr on tr.booking_id = b.id
       where b.departure_id = target_id and b.status in ('confirmed', 'completed')
      union all
      select jsonb_build_object(
               'full_name', b.contact_name, 'date_of_birth', null, 'nationality', null, 'dietary_notes', null,
               'booking_code', b.code, 'is_lead', true, 'phone', b.contact_phone,
               'party', b.adults + b.children + b.infants
             )
        from public.bookings b
       where b.departure_id = target_id and b.status in ('confirmed', 'completed')
         and not exists (select 1 from public.travellers tr where tr.booking_id = b.id)
    ) x(r);
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, changes)
  values (auth.uid(), 'departures.passenger_export', 'departures', target_id, jsonb_build_object('count', jsonb_array_length(rows)));
  return rows;
end;
$$;

-- Customers admin (spec decision 16) -------------------------------------------------------------
-- Consent history of a customer (account or confirmed address) for staff who read customers;
-- consent_records itself stays admin-only. No IP or user agent.
create function public.customer_consents(target_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'purpose', c.purpose, 'granted', c.granted, 'document_version', c.document_version, 'created_at', c.created_at
         ) order by c.created_at desc), '[]'::jsonb)
    from public.consent_records c
   where public.can_act_as('{sales,sales_manager,operator,accountant,admin}')
     and exists (select 1 from public.profiles p where p.id = target_id and p.role = 'customer')
     and (c.profile_id = target_id
          or lower(c.subject_email) = public.confirmed_customer_email(target_id))
$$;

-- The personal-data export (FEATURES "Customers", decision 8): the profile, bookings by account
-- and by confirmed address, their travellers, consents and inquiries. Service role only: the app
-- checks the MFA-verified admin and writes the audit row before handing the file out.
create function public.customer_data_export(target_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  address text := public.confirmed_customer_email(target_id);
  booking_ids uuid[];
begin
  select * into p from public.profiles where id = target_id and role = 'customer';
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select coalesce(array_agg(b.id), '{}') into booking_ids from public.bookings b
   where b.customer_id = p.id or (address is not null and lower(b.contact_email) = address);
  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id, 'email', p.email, 'confirmed_email', address, 'full_name', p.full_name, 'phone', p.phone,
      'country', p.country, 'locale', p.locale, 'marketing_consent', p.marketing_consent,
      'created_at', p.created_at, 'deletion_requested_at', p.deletion_requested_at, 'deleted_at', p.deleted_at
    ),
    'bookings', (select coalesce(jsonb_agg(jsonb_build_object(
                   'code', b.code, 'status', b.status, 'payment_state', b.payment_state,
                   'tour', b.tour_snapshot ->> 'title', 'start_date', b.start_date,
                   'adults', b.adults, 'children', b.children, 'infants', b.infants, 'single_rooms', b.single_rooms,
                   'contact_name', b.contact_name, 'contact_email', b.contact_email, 'contact_phone', b.contact_phone,
                   'contact_country', b.contact_country, 'special_requests', b.special_requests, 'locale', b.locale,
                   'total', b.total, 'amount_paid', b.amount_paid, 'invoice_info', b.invoice_info,
                   'terms_version', b.terms_version, 'created_at', b.created_at,
                   'linked_to_account', b.customer_id = p.id
                 ) order by b.created_at), '[]'::jsonb)
                   from public.bookings b where b.id = any(booking_ids)),
    'travellers', (select coalesce(jsonb_agg(jsonb_build_object(
                     'booking_code', b.code, 'full_name', tr.full_name, 'date_of_birth', tr.date_of_birth,
                     'gender', tr.gender, 'nationality', tr.nationality, 'dietary_notes', tr.dietary_notes, 'is_lead', tr.is_lead
                   ) order by b.code, tr.is_lead desc, tr.full_name), '[]'::jsonb)
                     from public.travellers tr join public.bookings b on b.id = tr.booking_id
                    where b.id = any(booking_ids)),
    'consents', (select coalesce(jsonb_agg(jsonb_build_object(
                   'purpose', c.purpose, 'granted', c.granted, 'document_version', c.document_version,
                   'ip', c.ip, 'user_agent', c.user_agent, 'created_at', c.created_at
                 ) order by c.created_at), '[]'::jsonb)
                   from public.consent_records c
                  where c.profile_id = p.id or (address is not null and lower(c.subject_email) = address)),
    'inquiries', (select coalesce(jsonb_agg(jsonb_build_object(
                    'code', i.code, 'status', i.status, 'source', i.source, 'name', i.name, 'email', i.email,
                    'phone', i.phone, 'country', i.country, 'company_name', i.company_name,
                    'travel_month', i.travel_month, 'duration_days', i.duration_days, 'adults', i.adults,
                    'children', i.children, 'budget_per_person', i.budget_per_person, 'message', i.message,
                    'locale', i.locale, 'created_at', i.created_at
                  ) order by i.created_at), '[]'::jsonb)
                    from public.inquiries i where address is not null and lower(i.email) = address)
  );
end;
$$;

-- Grants ----------------------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.departures_below_minimum(int)',
    'public.customer_deletion_blockers(uuid)',
    'public.customer_data_export(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
  foreach fn in array array[
    'public.admin_dashboard()',
    'public.admin_deletion_requests(uuid)',
    'public.export_departure_passengers(uuid)',
    'public.customer_consents(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end;
$$;

comment on function public.admin_dashboard() is
  'The /admin dashboard (spec Phase 5 decision 13): one jsonb with the sections the caller''s role may see (sales, operations, finance, content, admin).';
comment on function public.export_departure_passengers(uuid) is
  'Passenger list of a departure (operator, admin at aal2): travellers of confirmed and completed bookings, no passport numbers; audit row written first in the same transaction.';
comment on function public.customer_data_export(uuid) is
  'Personal-data export of a customer (service role): profile, bookings by account and confirmed address, travellers, consents, inquiries.';
