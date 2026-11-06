-- Booking core (docs/specs/phase-4-booking-payments.md decisions 1–5, ADR-012, ADR-016, ADR-033).
--
-- Seats and money change only here. Every function is security definer with an empty search path
-- and is callable by the service role only (the booking module after Zod, Turnstile and rate
-- limits). Each one first expires the booking's own overdue hold, so correctness never depends on
-- the pg_cron job, and writes a booking_events row for every status change.

-- Helpers ------------------------------------------------------------------------------------------

-- Hold length per provider from settings.booking_rules.hold_minutes (ADR-016 defaults).
create function public.hold_minutes(provider public.payment_provider)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case when jsonb_typeof(s.value -> 'hold_minutes' -> provider::text) = 'number'
                 then greatest(1, (s.value -> 'hold_minutes' ->> provider::text)::numeric::int) end
       from public.settings s where s.key = 'booking_rules'),
    case provider when 'vnpay' then 30 else 120 end
  )
$$;

create function public.vietnam_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date
$$;

-- PTA-2611-0042: prefix, Vietnam year and month, then the sequence.
create function public.next_booking_code()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select 'PTA-' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYMM') || '-'
         || lpad(nextval('public.booking_code_seq')::text, 4, '0')
$$;

-- Whether the booking's unit prices still equal the departure's (decision 2). Bookings without a
-- departure (quoted private tours) have staff-set prices and always pass.
create function public.booking_prices_current(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(bool_and(
           i.unit_price = case i.type
             when 'adult' then d.price_adult
             when 'child' then coalesce(d.price_child, d.price_adult)
             when 'infant' then coalesce(d.price_infant, 0)
             when 'single_supplement' then coalesce(d.single_supplement, 0)
             else i.unit_price
           end), true)
    from public.bookings b
    join public.departures d on d.id = b.departure_id
    join public.booking_items i on i.booking_id = b.id
   where b.id = target_id
$$;

create function public.log_booking_event(
  target_id uuid,
  event_type text,
  from_status public.booking_status,
  to_status public.booking_status,
  message text default null,
  actor uuid default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.booking_events (booking_id, type, from_status, to_status, message, actor_id)
  values (target_id, event_type, from_status, to_status, message, actor)
$$;

-- Takes `seats` on a bookable departure, or returns false (conditional update: no oversell).
create function public.take_seats(target_departure uuid, seats int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.departures
     set seats_reserved = seats_reserved + seats
   where id = target_departure
     and status in ('open', 'guaranteed')
     and seats_reserved + seats <= capacity;
  return found;
end;
$$;

create function public.release_seats(target_departure uuid, seats int)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.departures
     set seats_reserved = greatest(seats_reserved - seats, 0)
   where id = target_departure
$$;

-- payment_state from the money (refunds are `kind = 'refund'` rows; amount_paid is net).
create function public.refresh_payment_state(target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
  refunded bigint;
begin
  select * into b from public.bookings where id = target_id;
  select coalesce(sum(amount), 0) into refunded
    from public.payments where booking_id = target_id and kind = 'refund' and status = 'succeeded';
  update public.bookings
     set payment_state = case
           when refunded > 0 and b.amount_paid <= 0 then 'refunded'
           when refunded > 0 then 'partially_refunded'
           when b.amount_paid >= b.total then 'paid'
           when b.amount_paid > 0 and b.amount_paid >= b.deposit_amount then 'deposit_paid'
           else 'unpaid'
         end::public.booking_payment_state
   where id = target_id;
end;
$$;

-- Expiry on every read and write ------------------------------------------------------------------

-- Expires the booking's lapsed hold (or quote) and returns true when it did. Locks the booking.
create function public.expire_booking_if_due(target_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
begin
  select * into b from public.bookings where id = target_id for update;
  if not found then
    return false;
  end if;
  if b.status = 'pending_payment' and b.hold_expires_at is not null and b.hold_expires_at <= now() then
    if b.departure_id is not null then
      perform public.release_seats(b.departure_id, b.adults + b.children);
    end if;
  elsif not (b.status = 'quoted' and b.quote_expires_at is not null and b.quote_expires_at <= now()) then
    return false;
  end if;
  update public.payments set status = 'expired'
   where booking_id = target_id and status = 'pending';
  update public.bookings set status = 'expired', hold_expires_at = null where id = target_id;
  perform public.log_booking_event(target_id, 'status_changed', b.status, 'expired', 'hold or quote lapsed');
  return true;
end;
$$;

-- Drafts -------------------------------------------------------------------------------------------

-- Validates a draft payload against the departure and returns the departure id.
create function public.check_draft_payload(payload jsonb)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d public.departures;
  t public.tours;
  items_total bigint;
  priced boolean;
  adults int := coalesce((payload ->> 'adults')::int, 0);
  children int := coalesce((payload ->> 'children')::int, 0);
  infants int := coalesce((payload ->> 'infants')::int, 0);
  singles int := coalesce((payload ->> 'single_rooms')::int, 0);
  item_count int;
begin
  select * into d from public.departures where id = (payload ->> 'departure_id')::uuid;
  select * into t from public.tours where id = d.tour_id;
  if d.id is null or t.id is null or t.id <> (payload ->> 'tour_id')::uuid then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if t.status <> 'published' or t.type <> 'group' or d.status not in ('open', 'guaranteed')
     or d.start_date < public.vietnam_today() + public.booking_cutoff_days() then
    raise exception 'departure_closed';
  end if;
  -- Party rules (pricing.ts checkParty; ADR-016): an adult, infants x 2 <= adults, single rooms
  -- <= adults, travellers within the tour's limits.
  if adults < 1 or children < 0 or infants < 0 or singles < 0 or infants * 2 > adults or singles > adults
     or adults + children < t.min_pax or (t.max_pax is not null and adults + children > t.max_pax) then
    raise exception 'invalid_draft: party';
  end if;
  -- Exactly one line per priced type with a count, of that count, and no other line types.
  select count(*) into item_count from jsonb_array_elements(payload -> 'items');
  if item_count <> (adults > 0)::int + (children > 0)::int + (infants > 0)::int + (singles > 0)::int
     or exists (
       select 1 from jsonb_array_elements(payload -> 'items') i
        where i ->> 'type' is null
           or i ->> 'type' not in ('adult', 'child', 'infant', 'single_supplement')
           or (i ->> 'quantity')::int <> case i ->> 'type'
                when 'adult' then adults when 'child' then children
                when 'infant' then infants else singles end
     )
     or (select count(distinct i ->> 'type') from jsonb_array_elements(payload -> 'items') i) <> item_count then
    raise exception 'invalid_draft: items';
  end if;
  select coalesce(sum((i ->> 'amount')::bigint), 0),
         coalesce(bool_and(
           (i ->> 'amount')::bigint = (i ->> 'unit_price')::bigint * (i ->> 'quantity')::int
           and (i ->> 'unit_price')::bigint = case i ->> 'type'
             when 'adult' then d.price_adult
             when 'child' then coalesce(d.price_child, d.price_adult)
             when 'infant' then coalesce(d.price_infant, 0)
             when 'single_supplement' then coalesce(d.single_supplement, 0)
           end), false)
    into items_total, priced
    from jsonb_array_elements(payload -> 'items') i;
  if not priced then
    raise exception 'price_changed';
  end if;
  if items_total <> (payload ->> 'subtotal')::bigint or (payload ->> 'total')::bigint <> items_total
     or (payload ->> 'deposit_amount')::bigint not between 0 and items_total then
    raise exception 'invalid_draft: totals';
  end if;
  return d.id;
end;
$$;

-- Creates a draft booking (no seats taken). The same idempotency key returns the same booking.
create function public.create_draft_booking(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
  d public.departures;
  t public.tours;
  title text;
  policy public.cancellation_policies;
  new_id uuid;
begin
  select id into existing from public.bookings where idempotency_key = payload ->> 'idempotency_key';
  if existing is not null then
    return existing;
  end if;
  select * into d from public.departures where id = public.check_draft_payload(payload);
  select * into t from public.tours where id = d.tour_id;
  select tt.title into title from public.tour_translations tt
   where tt.tour_id = t.id and tt.locale = (payload ->> 'locale')::public.locale;
  select * into policy from public.cancellation_policies where id = t.cancellation_policy_id;

  insert into public.bookings (
    code, type, status, tour_id, departure_id, start_date, customer_id,
    adults, children, infants, single_rooms,
    contact_name, contact_email, contact_phone, contact_country, special_requests, locale,
    subtotal, total, deposit_amount, payment_plan, balance_due_date,
    tour_snapshot, cancellation_policy_snapshot, invoice_requested, invoice_info, idempotency_key, utm
  ) values (
    public.next_booking_code(), 'instant', 'draft', t.id, d.id, d.start_date, (payload ->> 'customer_id')::uuid,
    (payload ->> 'adults')::int, coalesce((payload ->> 'children')::int, 0),
    coalesce((payload ->> 'infants')::int, 0), coalesce((payload ->> 'single_rooms')::int, 0),
    payload ->> 'contact_name', payload ->> 'contact_email', payload ->> 'contact_phone',
    payload ->> 'contact_country', payload ->> 'special_requests', (payload ->> 'locale')::public.locale,
    (payload ->> 'subtotal')::bigint, (payload ->> 'total')::bigint, (payload ->> 'deposit_amount')::bigint,
    (payload ->> 'payment_plan')::public.payment_plan, (payload ->> 'balance_due_date')::date,
    jsonb_build_object(
      'code', t.code, 'title', title, 'duration_days', t.duration_days, 'duration_nights', t.duration_nights,
      'start_date', d.start_date, 'end_date', d.end_date, 'deposit_percent', t.deposit_percent,
      'balance_due_days', t.balance_due_days
    ),
    case when policy.id is null then null else jsonb_build_object(
      'id', policy.id, 'name', policy.name, 'version', policy.version, 'rules', policy.rules, 'summary', policy.summary
    ) end,
    coalesce((payload ->> 'invoice_requested')::boolean, false), payload -> 'invoice_info',
    payload ->> 'idempotency_key', payload -> 'utm'
  ) returning id into new_id;

  insert into public.booking_items (booking_id, type, label, unit_price, quantity, amount)
  select new_id, (i ->> 'type')::public.booking_item_type, coalesce(i ->> 'label', i ->> 'type'),
         (i ->> 'unit_price')::bigint, (i ->> 'quantity')::int, (i ->> 'amount')::bigint
    from jsonb_array_elements(payload -> 'items') i;
  perform public.log_booking_event(new_id, 'created', null, 'draft');
  return new_id;
exception
  when unique_violation then
    -- A concurrent submit with the same key won the insert.
    select id into existing from public.bookings where idempotency_key = payload ->> 'idempotency_key';
    if existing is null then
      raise;
    end if;
    return existing;
end;
$$;

-- Reprices a draft (party, plan or prices changed before paying). Same checks as creation.
create function public.update_draft_booking(target_id uuid, payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
begin
  select * into b from public.bookings where id = target_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if b.status <> 'draft' then
    raise exception 'not_payable';
  end if;
  perform public.check_draft_payload(payload || jsonb_build_object('tour_id', b.tour_id, 'departure_id', b.departure_id));
  update public.bookings set
    adults = (payload ->> 'adults')::int,
    children = coalesce((payload ->> 'children')::int, 0),
    infants = coalesce((payload ->> 'infants')::int, 0),
    single_rooms = coalesce((payload ->> 'single_rooms')::int, 0),
    subtotal = (payload ->> 'subtotal')::bigint,
    total = (payload ->> 'total')::bigint,
    deposit_amount = (payload ->> 'deposit_amount')::bigint,
    payment_plan = (payload ->> 'payment_plan')::public.payment_plan,
    balance_due_date = (payload ->> 'balance_due_date')::date
  where id = target_id;
  delete from public.booking_items where booking_id = target_id;
  insert into public.booking_items (booking_id, type, label, unit_price, quantity, amount)
  select target_id, (i ->> 'type')::public.booking_item_type, coalesce(i ->> 'label', i ->> 'type'),
         (i ->> 'unit_price')::bigint, (i ->> 'quantity')::int, (i ->> 'amount')::bigint
    from jsonb_array_elements(payload -> 'items') i;
  perform public.log_booking_event(target_id, 'repriced', 'draft', 'draft');
end;
$$;

-- Holds and payments -------------------------------------------------------------------------------

-- Holds seats (first payment) and opens a payment. `kind`: deposit or full before confirmation,
-- balance afterwards. Returns {payment_id, reference, amount, expires_at, booking_status}.
create function public.reserve_and_create_payment(
  target_id uuid,
  provider public.payment_provider,
  kind public.payment_kind
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
  minutes int;
  attempts int;
  amount bigint;
  expires timestamptz;
  ref text;
  new_payment uuid;
  max_attempts constant int := 5;
begin
  if provider not in ('vnpay', 'bank_transfer') then
    raise exception 'invalid_provider';
  end if;
  perform public.expire_booking_if_due(target_id);
  select * into b from public.bookings where id = target_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  minutes := public.hold_minutes(provider);
  expires := now() + make_interval(mins => minutes);

  if b.status in ('draft', 'quoted', 'pending_payment') then
    if kind not in ('deposit', 'full') then
      raise exception 'not_payable';
    end if;
    if kind = 'deposit' and b.payment_plan <> 'deposit' then
      raise exception 'plan_unavailable';
    end if;
    select count(*) into attempts from public.payments p
     where p.booking_id = b.id and p.kind in ('deposit', 'full');
    if attempts >= max_attempts then
      raise exception 'too_many_attempts';
    end if;
    if b.status = 'draft' and not public.booking_prices_current(b.id) then
      raise exception 'price_changed';
    end if;
    if kind = 'full' and b.payment_plan = 'deposit' then
      -- Paying in full at once: no deposit, no balance date.
      update public.bookings set payment_plan = 'full', deposit_amount = total, balance_due_date = null
       where id = b.id returning * into b;
    end if;
    if b.status in ('draft', 'quoted') then
      if b.departure_id is not null then
        if b.start_date < public.vietnam_today() + public.booking_cutoff_days() then
          raise exception 'departure_closed';
        end if;
        if not public.take_seats(b.departure_id, b.adults + b.children) then
          raise exception 'sold_out';
        end if;
      end if;
      update public.bookings set status = 'pending_payment', hold_expires_at = expires where id = b.id;
      perform public.log_booking_event(b.id, 'status_changed', b.status, 'pending_payment', provider::text);
    else
      -- Switching method (decision 4): the open payment is cancelled, the seats stay, and a new
      -- hold window starts; the attempt limit keeps it from being extended forever.
      update public.payments set status = 'cancelled' where booking_id = b.id and status = 'pending';
      update public.bookings set hold_expires_at = expires where id = b.id;
      perform public.log_booking_event(b.id, 'payment_method_changed', b.status, b.status, provider::text);
    end if;
    amount := case kind when 'deposit' then b.deposit_amount else b.total end - b.amount_paid;
  elsif b.status = 'confirmed' and b.amount_paid < b.total then
    if kind <> 'balance' then
      raise exception 'not_payable';
    end if;
    select count(*) into attempts from public.payments p where p.booking_id = b.id and p.kind = 'balance';
    if attempts >= max_attempts * 2 then
      raise exception 'too_many_attempts';
    end if;
    update public.payments set status = 'cancelled'
     where booking_id = b.id and status = 'pending' and payments.kind = 'balance';
    amount := b.total - b.amount_paid;
  else
    raise exception 'not_payable';
  end if;
  if amount <= 0 then
    raise exception 'not_payable';
  end if;

  select count(*) + 1 into attempts from public.payments p where p.booking_id = b.id;
  ref := replace(b.code, '-', '') || lpad(attempts::text, 2, '0');
  insert into public.payments (booking_id, provider, kind, status, amount, reference, expires_at)
  values (b.id, provider, kind, 'pending', amount, ref, expires)
  returning id into new_payment;
  return jsonb_build_object(
    'payment_id', new_payment, 'reference', ref, 'amount', amount, 'expires_at', expires,
    'booking_status', (select status from public.bookings where id = b.id)
  );
end;
$$;

-- The only way a gateway result reaches the database (decision 4, ADR-012). The caller has
-- verified the signature (and, for bank webhooks, that the event is an incoming credit) and
-- decides `succeeded` (VNPay: vnp_ResponseCode and vnp_TransactionStatus both '00'). Extra rows
-- for money on an attempt that is no longer pending keep that attempt's kind.
-- Idempotent per provider and event key. Returns
-- {result: duplicate | unmatched | failed | recorded, booking_id, status, needs_attention, attention_reason}.
create function public.record_payment_event(
  provider public.payment_provider,
  event_key text,
  payload jsonb,
  reference text,
  amount bigint,
  provider_txn_id text,
  succeeded boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id uuid;
  p public.payments;
  b public.bookings;
  reason text;
  next_status public.booking_status;
  extra int;
  received_ref text;
begin
  insert into public.webhook_events (provider, event_key, payload)
  values (provider, event_key, coalesce(payload, '{}'::jsonb))
  on conflict on constraint webhook_events_provider_event_key_key do nothing
  returning id into event_id;
  if event_id is null then
    return jsonb_build_object('result', 'duplicate');
  end if;

  select * into p from public.payments
   where upper(payments.reference) = upper(record_payment_event.reference)
     and payments.provider = record_payment_event.provider
     and payments.kind <> 'refund';
  if not found then
    update public.webhook_events set processed_at = now(), error = 'unmatched' where id = event_id;
    return jsonb_build_object('result', 'unmatched');
  end if;

  if not succeeded then
    -- A verified failure: the attempt is failed, the hold (and its seats) stays until it lapses.
    update public.payments set status = 'failed', raw_response = payload
     where id = p.id and status = 'pending';
    update public.webhook_events set processed_at = now(), error = 'failed' where id = event_id;
    return jsonb_build_object('result', 'failed', 'booking_id', p.booking_id);
  end if;
  if amount is null or amount <= 0 then
    update public.webhook_events set processed_at = now(), error = 'invalid_amount' where id = event_id;
    return jsonb_build_object('result', 'unmatched', 'booking_id', p.booking_id);
  end if;

  perform public.expire_booking_if_due(p.booking_id);
  select * into b from public.bookings where id = p.booking_id for update;
  select * into p from public.payments where id = p.id for update;

  -- The same gateway transaction under another event key (unique (provider, provider_txn_id))
  -- is a repeat: recording it again would fail on every retry. Adapters should key events on the
  -- gateway transaction id (4C).
  if record_payment_event.provider_txn_id is not null and exists (
       select 1 from public.payments
        where payments.provider = record_payment_event.provider
          and payments.provider_txn_id = record_payment_event.provider_txn_id
     ) then
    update public.webhook_events set processed_at = now(), error = 'duplicate_transaction' where id = event_id;
    return jsonb_build_object('result', 'duplicate', 'booking_id', b.id);
  end if;

  if p.status = 'pending' then
    update public.payments
       set status = 'succeeded', amount = record_payment_event.amount,
           provider_txn_id = coalesce(record_payment_event.provider_txn_id, payments.provider_txn_id),
           paid_at = now(), raw_response = payload,
           note = case when record_payment_event.amount <> p.amount then 'expected ' || p.amount end
     where id = p.id;
    received_ref := p.reference;
    if amount < p.amount then
      reason := 'underpaid';
    elsif amount > p.amount then
      reason := 'overpaid';
    end if;
  else
    -- Money for an attempt that is no longer pending (decision 4 step 5): never overwrite it;
    -- record what arrived as a new row and flag the booking.
    select count(*) into extra from public.payments where payments.reference like p.reference || '-%';
    received_ref := p.reference || '-' || (extra + 1);
    insert into public.payments (booking_id, provider, kind, status, amount, reference, provider_txn_id, paid_at, raw_response, note)
    values (b.id, p.provider, p.kind, 'succeeded', record_payment_event.amount, received_ref,
            record_payment_event.provider_txn_id, now(), payload,
            'received for ' || p.reference || ' (' || p.status || ')');
    -- paid_after_switch: the attempt was cancelled by a method switch; paid_after_failure: the
    -- gateway had reported it failed; paid_after_expiry: its window had passed.
    reason := case
      when b.status = 'cancelled' then 'paid_after_cancel'
      when p.status = 'succeeded' then 'overpaid'
      when b.status = 'expired' then null  -- the late-payment rules below decide
      when p.status = 'failed' then 'paid_after_failure'
      when p.status = 'expired' then 'paid_after_expiry'
      else 'paid_after_switch'
    end;
  end if;

  update public.bookings set amount_paid = amount_paid + record_payment_event.amount where id = b.id
  returning * into b;
  perform public.log_booking_event(b.id, 'payment_received', b.status, b.status, received_ref || ' ' || amount);

  next_status := b.status;
  if b.status = 'pending_payment' and b.amount_paid >= b.deposit_amount then
    next_status := 'confirmed';
    -- Any other open attempt is no longer needed.
    update public.payments set status = 'cancelled' where booking_id = b.id and status = 'pending';
  elsif b.status = 'expired' then
    -- Late payment (ADR-016): confirm when seats remain, otherwise keep the money and flag it.
    if b.amount_paid < b.deposit_amount then
      reason := coalesce(reason, 'late_payment_underpaid');
    elsif b.departure_id is null or public.take_seats(b.departure_id, b.adults + b.children) then
      next_status := 'confirmed';
    else
      reason := 'late_payment_no_seats';
    end if;
  elsif b.status in ('draft', 'quoted', 'completed') then
    reason := coalesce(reason, 'paid_' || b.status::text);
  elsif b.status = 'confirmed' and b.amount_paid > b.total then
    reason := coalesce(reason, 'overpaid');
  end if;
  -- A cancelled booking is never confirmed by money arriving.

  if next_status <> b.status then
    update public.bookings set status = next_status, hold_expires_at = null where id = b.id;
    perform public.log_booking_event(b.id, 'status_changed', b.status, next_status, received_ref);
  end if;
  if reason is not null then
    update public.bookings set needs_attention = true, attention_reason = reason where id = b.id;
    perform public.log_booking_event(b.id, 'needs_attention', next_status, next_status, reason);
  end if;
  perform public.refresh_payment_state(b.id);
  update public.webhook_events set processed_at = now() where id = event_id;
  return jsonb_build_object(
    'result', 'recorded', 'booking_id', b.id, 'status', next_status, 'needs_attention', reason is not null,
    'attention_reason', reason
  );
end;
$$;

-- Jobs and cancellation ----------------------------------------------------------------------------

-- pg_cron, every 5 minutes: lapsed holds and quotes, and drafts older than 7 days.
create function public.expire_holds()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  expired int := 0;
begin
  -- The job holds a departure's lock once it releases seats, so it must never wait for a booking
  -- lock afterwards: a customer's function locks its booking first and then the departure, and
  -- waiting here would deadlock against it (PR 25 review). Bookings locked by someone else are
  -- skipped; their own functions expire them first, and the next run gets the rest.
  for target in
    select id from public.bookings
     where (status = 'pending_payment' and hold_expires_at <= now())
        or (status = 'quoted' and quote_expires_at <= now())
     order by id
     for update skip locked
  loop
    if public.expire_booking_if_due(target) then
      expired := expired + 1;
    end if;
  end loop;
  with old_drafts as (
    update public.bookings set status = 'expired'
     where id in (
       select id from public.bookings
        where status = 'draft' and created_at < now() - interval '7 days'
        for update skip locked
     )
    returning id
  )
  insert into public.booking_events (booking_id, type, from_status, to_status, message)
  select id, 'status_changed', 'draft', 'expired', 'draft not paid within 7 days' from old_drafts;
  return expired;
end;
$$;

-- Cancels a booking, releases its seats and returns the refund its policy snapshot suggests
-- ({refund_percent, refund_amount}); the refund itself is recorded separately (4F).
create function public.cancel_booking(target_id uuid, actor uuid, reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
  days_before int;
  percent int := 0;
begin
  perform public.expire_booking_if_due(target_id);
  select * into b from public.bookings where id = target_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if b.status not in ('draft', 'quoted', 'pending_payment', 'confirmed', 'expired') then
    raise exception 'not_cancellable';
  end if;
  if b.status in ('pending_payment', 'confirmed') and b.departure_id is not null then
    perform public.release_seats(b.departure_id, b.adults + b.children);
  end if;
  update public.payments set status = 'cancelled' where booking_id = b.id and status = 'pending';
  update public.bookings
     set status = 'cancelled', hold_expires_at = null, cancelled_at = now(), cancel_reason = reason
   where id = b.id;
  perform public.log_booking_event(b.id, 'status_changed', b.status, 'cancelled', reason, actor);

  days_before := b.start_date - public.vietnam_today();
  select coalesce((r ->> 'refund_percent')::int, 0) into percent
    from jsonb_array_elements(coalesce(b.cancellation_policy_snapshot -> 'rules', '[]'::jsonb)) r
   where (r ->> 'min_days_before')::int <= days_before
   order by (r ->> 'min_days_before')::int desc
   limit 1;
  percent := coalesce(percent, 0);
  return jsonb_build_object(
    'refund_percent', percent,
    'refund_amount', round(b.amount_paid * percent / 100.0)::bigint
  );
end;
$$;

-- Nightly: confirmed bookings whose trip has ended.
create function public.complete_bookings()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  done int;
begin
  with finished as (
    update public.bookings b set status = 'completed'
      from public.departures d
     where b.status = 'confirmed' and d.id = b.departure_id and d.end_date < public.vietnam_today()
    returning b.id
  ), logged as (
    insert into public.booking_events (booking_id, type, from_status, to_status, message)
    select id, 'status_changed', 'confirmed', 'completed', 'trip ended' from finished
    returning 1
  )
  select count(*) into done from logged;
  return done;
end;
$$;

-- Nightly: seats_reserved must equal the seats of pending, confirmed and completed bookings.
-- Mismatches are written to audit_logs and raised as a warning; seats are never "fixed" here.
create function public.check_seat_invariant()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  mismatch record;
  found_count int := 0;
begin
  for mismatch in
    select d.id, d.seats_reserved,
           coalesce(sum(b.adults + b.children) filter (where b.status in ('pending_payment', 'confirmed', 'completed')), 0) as expected
      from public.departures d
      left join public.bookings b on b.departure_id = d.id
     group by d.id, d.seats_reserved
    having d.seats_reserved <> coalesce(sum(b.adults + b.children) filter (where b.status in ('pending_payment', 'confirmed', 'completed')), 0)
  loop
    found_count := found_count + 1;
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, changes)
    values (null, 'departures.seat_mismatch', 'departures', mismatch.id,
            jsonb_build_object('seats_reserved', mismatch.seats_reserved, 'expected', mismatch.expected));
    raise warning 'seat invariant: departure % has % reserved, bookings hold %', mismatch.id, mismatch.seats_reserved, mismatch.expected;
  end loop;
  return found_count;
end;
$$;

-- Fails (so the pg_cron run is marked failed and alerts) when the invariant check of the last day
-- found a mismatch. A separate job: raising inside check_seat_invariant() would roll back the
-- audit rows that explain the mismatch.
create function public.raise_on_seat_mismatch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  mismatches int;
begin
  select count(*) into mismatches from public.audit_logs
   where action = 'departures.seat_mismatch' and created_at > now() - interval '1 day';
  if mismatches > 0 then
    raise exception 'seat invariant: % mismatch(es) in the last day, see audit_logs departures.seat_mismatch', mismatches;
  end if;
end;
$$;

-- Service role only ----------------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.hold_minutes(public.payment_provider)',
    'public.next_booking_code()',
    'public.booking_prices_current(uuid)',
    'public.log_booking_event(uuid, text, public.booking_status, public.booking_status, text, uuid)',
    'public.take_seats(uuid, int)',
    'public.release_seats(uuid, int)',
    'public.refresh_payment_state(uuid)',
    'public.expire_booking_if_due(uuid)',
    'public.check_draft_payload(jsonb)',
    'public.create_draft_booking(jsonb)',
    'public.update_draft_booking(uuid, jsonb)',
    'public.reserve_and_create_payment(uuid, public.payment_provider, public.payment_kind)',
    'public.record_payment_event(public.payment_provider, text, jsonb, text, bigint, text, boolean)',
    'public.expire_holds()',
    'public.cancel_booking(uuid, uuid, text)',
    'public.complete_bookings()',
    'public.check_seat_invariant()',
    'public.raise_on_seat_mismatch()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
-- vietnam_today() is a pure helper without data access.
