-- Private-tour quotes and payment links (docs/specs/phase-4-booking-payments.md PR 4D, steps
-- 13–14, ADR-016). Sales create a `quoted` booking with the final price; a payment link (a hashed,
-- single-use token with an expiry) opens the standard checkout for it, and for balances later.

-- A quote from sales (sales, sales_manager or admin): staff set the price per adult and per child;
-- infants travel free. No seats: quotes are for private tours (no departure). Payment follows the
-- standard flow once the customer opens a payment link.
create function public.create_quote(payload jsonb)
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
  new_id uuid;
begin
  if not public.can_act_as('{sales,sales_manager,admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into t from public.tours where id = (payload ->> 'tour_id')::uuid and status <> 'archived';
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
  select tt.title into title from public.tour_translations tt
   where tt.tour_id = t.id and tt.locale = (payload ->> 'locale')::public.locale;
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
    update public.inquiries set status = 'quoted' where id = inquiry and status in ('new', 'contacted');
  end if;
  perform public.log_booking_event(new_id, 'created', null, 'quoted', null, auth.uid());
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, changes)
  values (auth.uid(), 'bookings.quote', 'bookings', new_id,
          jsonb_build_object('tour', t.code, 'total', total, 'plan', plan, 'valid_days', valid_days));
  return new_id;
end;
$$;

-- A payment link for a quote, an unpaid booking or a balance (sales roles and admin). The token
-- is made by the app; only its SHA-256 is stored. The amount is what is due now.
create function public.create_payment_link(target_id uuid, token_hash text, valid_hours int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
  due bigint;
  link_kind public.payment_kind;
  expires timestamptz;
begin
  if not public.can_act_as('{sales,sales_manager,admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if token_hash !~ '^[0-9a-f]{64}$' or valid_hours not between 1 and 168 then
    raise exception 'invalid_link';
  end if;
  perform public.expire_booking_if_due(target_id);
  select * into b from public.bookings where id = target_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if b.status in ('draft', 'quoted', 'pending_payment') then
    link_kind := b.payment_plan::text::public.payment_kind;
    due := (case when b.payment_plan = 'deposit' then b.deposit_amount else b.total end) - b.amount_paid;
  elsif b.status = 'confirmed' and b.amount_paid < b.total then
    link_kind := 'balance';
    due := b.total - b.amount_paid;
  else
    raise exception 'not_payable';
  end if;
  if due <= 0 then
    raise exception 'not_payable';
  end if;
  expires := now() + make_interval(hours => valid_hours);
  -- A quote's link never outlives the quote.
  if b.status = 'quoted' and b.quote_expires_at is not null then
    expires := least(expires, b.quote_expires_at);
  end if;
  insert into public.payment_links (booking_id, token_hash, amount, kind, expires_at, created_by)
  values (b.id, create_payment_link.token_hash, due, link_kind, expires, auth.uid());
  perform public.log_booking_event(b.id, 'payment_link_created', null, null, link_kind || ' ' || due, auth.uid());
  return jsonb_build_object('amount', due, 'kind', link_kind, 'expires_at', expires, 'code', b.code, 'locale', b.locale);
end;
$$;

-- The customer opens a link (service role, from the link page's button, never a plain visit, so
-- mail scanners cannot use it up): single use, before its expiry, for a booking still payable.
create function public.redeem_payment_link(token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link public.payment_links;
  b public.bookings;
begin
  select * into link from public.payment_links l where l.token_hash = redeem_payment_link.token_hash for update;
  if not found then
    raise exception 'link_invalid';
  end if;
  if link.used_at is not null then
    raise exception 'link_used';
  end if;
  if link.expires_at <= now() then
    raise exception 'link_expired';
  end if;
  perform public.expire_booking_if_due(link.booking_id);
  select * into b from public.bookings where id = link.booking_id;
  if b.status not in ('draft', 'quoted', 'pending_payment', 'confirmed') or b.amount_paid >= b.total then
    raise exception 'not_payable';
  end if;
  update public.payment_links set used_at = now() where id = link.id;
  perform public.log_booking_event(b.id, 'payment_link_opened', null, null, link.kind::text, null);
  return jsonb_build_object('booking_id', b.id, 'code', b.code, 'locale', b.locale);
end;
$$;

-- Whether a link can still be opened, for the link page (no side effects).
create function public.payment_link_state(token_hash text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when l.id is null then 'invalid'
    when l.used_at is not null then 'used'
    when l.expires_at <= now() then 'expired'
    else 'valid'
  end
  from (select 1) one
  left join public.payment_links l on l.token_hash = payment_link_state.token_hash
$$;

revoke execute on function public.create_quote(jsonb) from public, anon;
grant execute on function public.create_quote(jsonb) to authenticated, service_role;
revoke execute on function public.create_payment_link(uuid, text, int) from public, anon;
grant execute on function public.create_payment_link(uuid, text, int) to authenticated, service_role;
revoke execute on function public.redeem_payment_link(text) from public, anon, authenticated;
grant execute on function public.redeem_payment_link(text) to service_role;
revoke execute on function public.payment_link_state(text) from public, anon, authenticated;
grant execute on function public.payment_link_state(text) to service_role;
