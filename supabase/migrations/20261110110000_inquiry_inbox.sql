-- Inquiry inbox (Phase 5 PR 5C, spec decision 9, ADR-037).
--
-- * sales_manager now reads every inquiry (the matrix change of ADR-037); sales keep assigned and
--   unassigned ones; operator and admin read all.
-- * API roles can no longer UPDATE inquiries: status, owner and first response change only through
--   the role-checked definer functions below, which also write `audit_logs`. Staff inserts (kept
--   for manual leads) may not set those columns either (column grants).
-- * assign_inquiry(), update_inquiry_status(), add_inquiry_note(..., contacted) and the first-response
--   rule; create_quote() amended to check the inquiry's owner and count a quote as a first response.
-- * inquiry_consents() and inquiry_activity() let staff who can read an inquiry see its consent
--   versions and its history (consent_records and audit_logs stay admin-only tables).

-- Read policies ---------------------------------------------------------------------------------
drop policy "inquiries: sales read assigned or unassigned" on public.inquiries;
drop policy "inquiries: admin and operator read" on public.inquiries;

create policy "inquiries: sales read assigned or unassigned" on public.inquiries
  for select to authenticated
  using (
    (select public.can_act_as('{sales}'))
    and (assigned_to is null or assigned_to = (select auth.uid()))
  );

create policy "inquiries: managers, operator and admin read" on public.inquiries
  for select to authenticated
  using ((select public.can_act_as('{sales_manager,operator,admin}')));

-- Writes only through functions -----------------------------------------------------------------
drop policy "inquiries: sales update assigned or unassigned" on public.inquiries;
drop policy "inquiries: admin update" on public.inquiries;
revoke update on public.inquiries from authenticated;

-- Staff may still insert a lead by hand (the insert policy is unchanged), but never with a status,
-- an owner or a first response: those come from the defaults and then from the functions.
revoke insert on public.inquiries from authenticated;
grant insert (
  code, name, email, phone, country, company_name, preferred_contact, destination_ids, destinations_other,
  travel_style_id, tour_id, travel_month, flexible_dates, duration_days, adults, children, budget_per_person,
  message, locale, source, utm
) on public.inquiries to authenticated;

-- Helpers ---------------------------------------------------------------------------------------
-- Whether the caller may work (assign, change, note, quote) an inquiry with this owner: sales
-- managers and admins any; sales their own and unassigned ones.
create function public.can_work_inquiry(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_act_as('{sales_manager,admin}')
      or (public.can_act_as('{sales}') and (owner is null or owner = (select auth.uid())))
$$;

-- Whether the caller may read it: the above, and operators.
create function public.can_read_inquiry(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_work_inquiry(owner) or public.can_act_as('{operator}')
$$;

-- Locks the row the caller may work; not_found (P0002) otherwise, so a seller cannot tell an
-- inquiry assigned to someone else from one that does not exist.
create function public.lock_workable_inquiry(target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  if not public.can_act_as('{sales,sales_manager,admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select assigned_to into owner from public.inquiries where id = target_id for update;
  if not found or not public.can_work_inquiry(owner) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

create function public.log_inquiry_change(target_id uuid, action text, changes jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, changes)
  values ((select auth.uid()), action, 'inquiries', target_id, changes)
$$;

-- Assignment ------------------------------------------------------------------------------------
-- Sales may only take an unassigned inquiry for themselves; sales managers and admins assign
-- anyone with a sales role or admin (active), or nobody.
create function public.assign_inquiry(target_id uuid, assignee uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.inquiries;
begin
  perform public.lock_workable_inquiry(target_id);
  select * into i from public.inquiries where id = target_id;
  if not public.can_act_as('{sales_manager,admin}') and assignee is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if i.assigned_to is not distinct from assignee then
    return;
  end if;
  if assignee is not null and not exists (
    select 1 from public.profiles p
     where p.id = assignee and p.role in ('sales', 'sales_manager', 'admin') and p.is_active and p.deleted_at is null
  ) then
    raise exception 'invalid_assignee' using errcode = '22023';
  end if;
  update public.inquiries set assigned_to = assignee where id = i.id;
  perform public.log_inquiry_change(i.id, 'inquiries.assign', jsonb_build_object(
    'before', jsonb_build_object('assigned_to', i.assigned_to),
    'after', jsonb_build_object('assigned_to', assignee)
  ));
end;
$$;

-- Status ----------------------------------------------------------------------------------------
-- Any status but `new` (which means "not answered yet"); the same status changes nothing. The
-- first change away from `new` is the first response, except marking it as spam. An optional note
-- is kept as an internal note.
create function public.update_inquiry_status(target_id uuid, new_status public.inquiry_status, note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.inquiries;
  clean_note text := nullif(trim(coalesce(note, '')), '');
begin
  perform public.lock_workable_inquiry(target_id);
  select * into i from public.inquiries where id = target_id;
  if new_status is null or new_status = 'new' then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if clean_note is not null and char_length(clean_note) > 2000 then
    raise exception 'note_too_long' using errcode = '22001';
  end if;
  if new_status = i.status then
    return;
  end if;
  update public.inquiries
     set status = new_status,
         first_responded_at = case
           when i.status = 'new' and new_status <> 'spam' then coalesce(i.first_responded_at, now())
           else i.first_responded_at
         end
   where id = i.id;
  if clean_note is not null then
    insert into public.internal_notes (body, author_id, inquiry_id) values (clean_note, auth.uid(), i.id);
  end if;
  perform public.log_inquiry_change(i.id, 'inquiries.status', jsonb_build_object(
    'before', jsonb_build_object('status', i.status),
    'after', jsonb_build_object('status', new_status),
    'note', clean_note is not null
  ));
end;
$$;

-- Notes -----------------------------------------------------------------------------------------
-- A note (3–2000 characters). `contacted` records that the customer was contacted: the first one
-- sets the first response, and a `new` inquiry becomes `contacted`.
create function public.add_inquiry_note(target_id uuid, body text, contacted boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.inquiries;
  clean_note text;
  note_id uuid;
begin
  perform public.lock_workable_inquiry(target_id);
  select * into i from public.inquiries where id = target_id;
  clean_note := public.require_note(body);
  if char_length(clean_note) > 2000 then
    raise exception 'note_too_long' using errcode = '22001';
  end if;
  insert into public.internal_notes (body, author_id, inquiry_id) values (clean_note, auth.uid(), i.id)
  returning id into note_id;
  if coalesce(contacted, false) then
    update public.inquiries
       set first_responded_at = coalesce(first_responded_at, now()),
           status = case when status = 'new' then 'contacted'::public.inquiry_status else status end
     where id = i.id;
  end if;
  perform public.log_inquiry_change(i.id, 'inquiries.note', jsonb_build_object(
    'contacted', coalesce(contacted, false),
    'before', jsonb_build_object('status', i.status),
    'after', jsonb_build_object('status', case when coalesce(contacted, false) and i.status = 'new' then 'contacted'::public.inquiry_status else i.status end)
  ));
  return note_id;
end;
$$;

-- Reads for the detail page ---------------------------------------------------------------------
create function public.inquiry_consents(target_id uuid)
returns table (purpose public.consent_purpose, granted boolean, document_version text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.purpose, c.granted, c.document_version, c.created_at
    from public.consent_records c
    join public.inquiries i on i.id = c.inquiry_id
   where i.id = target_id and public.can_read_inquiry(i.assigned_to)
   order by c.created_at
$$;

-- The inquiry's audit rows (status, owner, notes, quotes): ids, statuses and flags only.
create function public.inquiry_activity(target_id uuid)
returns table (action text, changes jsonb, actor_id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.action, a.changes, a.actor_id, a.created_at
    from public.audit_logs a
    join public.inquiries i on i.id = a.entity_id
   where a.entity_type = 'inquiries' and i.id = target_id and public.can_read_inquiry(i.assigned_to)
   order by a.created_at desc, a.id
   limit 200
$$;

-- create_quote(): the inquiry must be one the caller may work; a quote is a first response and
-- gives an unassigned inquiry to the seller who quoted it. Same signature and grants.
create or replace function public.create_quote(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tours;
  title text;
  policy public.cancellation_policies;
  adults int := (payload ->> 'adults')::int;
  children int := coalesce((payload ->> 'children')::int, 0);
  infants int := coalesce((payload ->> 'infants')::int, 0);
  price_adult bigint := (payload ->> 'price_adult')::bigint;
  price_child bigint := coalesce((payload ->> 'price_child')::bigint, 0);
  total bigint;
  deposit bigint;
  plan public.payment_plan := (payload ->> 'payment_plan')::public.payment_plan;
  start_date date := (payload ->> 'start_date')::date;
  valid_days int := coalesce((payload ->> 'valid_days')::int, 7);
  inquiry uuid := nullif(payload ->> 'inquiry_id', '')::uuid;
  inq public.inquiries;
  new_id uuid;
begin
  if not public.can_act_as('{sales,sales_manager,admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if inquiry is not null then
    perform public.lock_workable_inquiry(inquiry);
    select * into inq from public.inquiries where id = inquiry;
  end if;
  -- Quotes are for private tours only (#34 review); group tours are booked at departure prices.
  select * into t from public.tours
   where id = (payload ->> 'tour_id')::uuid and status <> 'archived' and type = 'private';
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if adults is null or adults < 1 or children < 0 or infants < 0 or infants * 2 > adults
     or price_adult is null or price_adult <= 0 or price_child < 0 or (children > 0 and price_child <= 0) then
    raise exception 'invalid_quote';
  end if;
  if start_date is null or start_date <= public.vietnam_today() or valid_days not between 1 and 30 then
    raise exception 'invalid_quote';
  end if;
  if coalesce(trim(payload ->> 'contact_name'), '') = '' or coalesce(trim(payload ->> 'contact_email'), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or coalesce(trim(payload ->> 'contact_phone'), '') = '' then
    raise exception 'invalid_quote';
  end if;
  total := adults * price_adult + children * price_child;
  -- The deposit plan only while the balance can still wait (pricing.ts availablePlans()).
  if plan = 'deposit' and (t.deposit_percent <= 0 or t.deposit_percent >= 100 or start_date - public.vietnam_today() <= t.balance_due_days) then
    raise exception 'plan_unavailable';
  end if;
  deposit := case when plan = 'deposit' then least(total, ceil(total * t.deposit_percent / 100.0 / 1000) * 1000)::bigint else total end;
  -- The title in the quote's language, else the other language's (#34 review), never null.
  select tt.title into title from public.tour_translations tt
   where tt.tour_id = t.id and nullif(trim(tt.title), '') is not null
   order by (tt.locale = (payload ->> 'locale')::public.locale) desc, tt.locale
   limit 1;
  title := coalesce(title, t.code);
  select * into policy from public.cancellation_policies where id = t.cancellation_policy_id;

  insert into public.bookings (
    code, type, status, tour_id, start_date, assigned_to, inquiry_id,
    adults, children, infants, single_rooms,
    contact_name, contact_email, contact_phone, special_requests, locale,
    subtotal, total, deposit_amount, payment_plan, balance_due_date, quote_expires_at,
    tour_snapshot, cancellation_policy_snapshot
  ) values (
    public.next_booking_code(), 'quoted', 'quoted', t.id, start_date, auth.uid(), inquiry,
    adults, children, infants, 0,
    trim(payload ->> 'contact_name'), lower(trim(payload ->> 'contact_email')), trim(payload ->> 'contact_phone'),
    nullif(trim(payload ->> 'special_requests'), ''), (payload ->> 'locale')::public.locale,
    total, total, deposit, plan,
    case when plan = 'deposit' then start_date - t.balance_due_days end,
    now() + make_interval(days => valid_days),
    jsonb_build_object(
      'code', t.code, 'title', title, 'duration_days', t.duration_days, 'duration_nights', t.duration_nights,
      'start_date', start_date, 'end_date', start_date + greatest(t.duration_days - 1, 0),
      'deposit_percent', t.deposit_percent, 'balance_due_days', t.balance_due_days
    ),
    case when policy.id is null then null else jsonb_build_object(
      'id', policy.id, 'name', policy.name, 'version', policy.version, 'rules', policy.rules, 'summary', policy.summary
    ) end
  ) returning id into new_id;

  insert into public.booking_items (booking_id, type, label, unit_price, quantity, amount)
  values (new_id, 'adult', 'adult', price_adult, adults, adults * price_adult);
  if children > 0 then
    insert into public.booking_items (booking_id, type, label, unit_price, quantity, amount)
    values (new_id, 'child', 'child', price_child, children, children * price_child);
  end if;
  if infants > 0 then
    insert into public.booking_items (booking_id, type, label, unit_price, quantity, amount)
    values (new_id, 'infant', 'infant', 0, infants, 0);
  end if;
  if inquiry is not null then
    update public.inquiries
       set status = case when inq.status in ('new', 'contacted') then 'quoted'::public.inquiry_status else inq.status end,
           first_responded_at = coalesce(inq.first_responded_at, now()),
           assigned_to = coalesce(inq.assigned_to, auth.uid())
     where id = inquiry;
    perform public.log_inquiry_change(inquiry, 'inquiries.quote', jsonb_build_object(
      'booking_id', new_id,
      'before', jsonb_build_object('status', inq.status, 'assigned_to', inq.assigned_to),
      'after', jsonb_build_object(
        'status', case when inq.status in ('new', 'contacted') then 'quoted'::public.inquiry_status else inq.status end,
        'assigned_to', coalesce(inq.assigned_to, auth.uid()))
    ));
  end if;
  perform public.log_booking_event(new_id, 'created', null, 'quoted', null, auth.uid());
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, changes)
  values (auth.uid(), 'bookings.quote', 'bookings', new_id,
          jsonb_build_object('tour', t.code, 'total', total, 'plan', plan, 'valid_days', valid_days));
  return new_id;
end;
$$;

-- Grants ----------------------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.can_work_inquiry(uuid)',
    'public.can_read_inquiry(uuid)',
    'public.assign_inquiry(uuid, uuid)',
    'public.update_inquiry_status(uuid, public.inquiry_status, text)',
    'public.add_inquiry_note(uuid, text, boolean)',
    'public.inquiry_consents(uuid)',
    'public.inquiry_activity(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
  -- Internal helpers of the functions above: never called through the API.
  foreach fn in array array['public.lock_workable_inquiry(uuid)', 'public.log_inquiry_change(uuid, text, jsonb)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
  end loop;
end;
$$;

comment on function public.assign_inquiry(uuid, uuid) is
  'Inquiry owner (ADR-037): sales take an unassigned inquiry for themselves; sales managers and admins assign anyone with a sales role or admin, or nobody.';
comment on function public.update_inquiry_status(uuid, public.inquiry_status, text) is
  'Inquiry status (not back to new); the first change away from new (except spam) is the first response; optional note.';
comment on function public.add_inquiry_note(uuid, text, boolean) is
  'Internal note on an inquiry; contacted = true sets the first response once and moves new to contacted.';
