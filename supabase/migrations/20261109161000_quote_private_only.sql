-- #34 review backlog: create_quote() only quotes private tours, and the snapshot's tour title falls
-- back to the other language (then the tour code) when the quote's language has none. Same
-- signature and grants; only the body changes.
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
  new_id uuid;
begin
  if not public.can_act_as('{sales,sales_manager,admin}') then
    raise exception 'forbidden' using errcode = '42501';
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
    update public.inquiries set status = 'quoted' where id = inquiry and status in ('new', 'contacted');
  end if;
  perform public.log_booking_event(new_id, 'created', null, 'quoted', null, auth.uid());
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, changes)
  values (auth.uid(), 'bookings.quote', 'bookings', new_id,
          jsonb_build_object('tour', t.code, 'total', total, 'plan', plan, 'valid_days', valid_days));
  return new_id;
end;
$$;
