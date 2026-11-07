-- Admin actions on bookings and payments (docs/specs/phase-4-booking-payments.md PR 4F, decisions
-- 4 and 5, ADR-012). Staff call these with their own session: each is security definer, checks the
-- caller's role with can_act_as() (admin and accountant need aal2), and changes seats and money only
-- through the booking functions. Money moves are written to audit_logs with the staff member.

-- A note is required for every manual money movement and for resolving the queue.
create function public.require_note(note text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if note is null or char_length(trim(note)) < 3 then
    raise exception 'note_required';
  end if;
  return trim(note);
end;
$$;

-- Cash, a transfer with a wrong memo, or a payment confirmed by phone with the bank: recorded by an
-- MFA-verified accountant or admin, through record_payment_event() so confirmation, late payments
-- and flags follow the same rules as the gateways.
create function public.record_manual_payment(target_id uuid, amount bigint, method public.payment_provider, note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
  clean_note text;
  attempt int;
  ref text;
  new_payment uuid;
  result jsonb;
begin
  if not public.can_act_as('{accountant,admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  clean_note := public.require_note(note);
  if method not in ('cash', 'manual', 'bank_transfer') then
    raise exception 'invalid_provider';
  end if;
  if amount is null or amount <= 0 then
    raise exception 'invalid_amount';
  end if;
  perform public.expire_booking_if_due(target_id);
  select * into b from public.bookings where id = target_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if b.status = 'draft' then
    raise exception 'not_payable';
  end if;
  select count(*) + 1 into attempt from public.payments p where p.booking_id = b.id;
  ref := 'M' || replace(b.code, '-', '') || lpad(attempt::text, 2, '0');
  insert into public.payments (booking_id, provider, kind, status, amount, reference, note, recorded_by)
  values (b.id, method,
          case when b.status = 'confirmed' then 'balance'
               when b.amount_paid + amount >= b.total then 'full' else 'deposit' end::public.payment_kind,
          'pending', amount, ref, clean_note, auth.uid())
  returning id into new_payment;
  result := public.record_payment_event(method, 'manual:' || new_payment, jsonb_build_object('note', clean_note, 'recorded_by', auth.uid()),
                                        ref, amount, null, true);
  update public.payments set note = clean_note, recorded_by = auth.uid() where id = new_payment;
  perform public.log_booking_event(b.id, 'manual_payment', null, null, ref || ' ' || amount || ': ' || clean_note, auth.uid());
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, changes)
  values (auth.uid(), 'payments.manual_record', 'payments', new_payment,
          jsonb_build_object('booking', b.code, 'amount', amount, 'method', method, 'note', clean_note));
  return result || jsonb_build_object('payment_id', new_payment, 'reference', ref);
end;
$$;

-- A refund paid back outside the gateways (decision 4): never more than what was received net of
-- earlier refunds; the payment state is recomputed.
create function public.record_refund(target_id uuid, amount bigint, method public.payment_provider, note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
  clean_note text;
  attempt int;
  ref text;
  new_payment uuid;
begin
  if not public.can_act_as('{accountant,admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  clean_note := public.require_note(note);
  if method not in ('cash', 'manual', 'bank_transfer', 'vnpay') then
    raise exception 'invalid_provider';
  end if;
  if amount is null or amount <= 0 then
    raise exception 'invalid_amount';
  end if;
  select * into b from public.bookings where id = target_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if amount > b.amount_paid then
    raise exception 'refund_too_large';
  end if;
  select count(*) + 1 into attempt from public.payments p where p.booking_id = b.id;
  ref := 'R' || replace(b.code, '-', '') || lpad(attempt::text, 2, '0');
  insert into public.payments (booking_id, provider, kind, status, amount, reference, paid_at, note, recorded_by)
  values (b.id, method, 'refund', 'succeeded', amount, ref, now(), clean_note, auth.uid())
  returning id into new_payment;
  update public.bookings set amount_paid = amount_paid - amount where id = b.id;
  perform public.refresh_payment_state(b.id);
  perform public.log_booking_event(b.id, 'refund', null, null, ref || ' ' || amount || ': ' || clean_note, auth.uid());
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, changes)
  values (auth.uid(), 'payments.refund', 'payments', new_payment,
          jsonb_build_object('booking', b.code, 'amount', amount, 'method', method, 'note', clean_note));
  return jsonb_build_object('payment_id', new_payment, 'reference', ref,
    'amount_paid', (select amount_paid from public.bookings where id = b.id),
    'payment_state', (select payment_state from public.bookings where id = b.id));
end;
$$;

-- A bank transfer whose memo matched no payment (webhook_events.error = 'unmatched'): an
-- MFA-verified accountant or admin assigns it to the booking it was meant for. The amount comes
-- from the verified webhook, never from the form, and the gateway transaction id keeps it from
-- being counted twice.
create function public.assign_unmatched_transfer(event_id uuid, target_id uuid, note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.webhook_events;
  b public.bookings;
  clean_note text;
  received bigint;
  attempt int;
  ref text;
  new_payment uuid;
  result jsonb;
begin
  if not public.can_act_as('{accountant,admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  clean_note := public.require_note(note);
  select * into e from public.webhook_events w where w.id = event_id for update;
  if not found or e.provider <> 'bank_transfer' or e.error is distinct from 'unmatched' then
    raise exception 'not_unmatched';
  end if;
  received := coalesce(e.payload ->> 'transferAmount', e.payload ->> 'amount')::bigint;
  if received is null or received <= 0 then
    raise exception 'invalid_amount';
  end if;
  perform public.expire_booking_if_due(target_id);
  select * into b from public.bookings where id = target_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if b.status = 'draft' then
    raise exception 'not_payable';
  end if;
  select count(*) + 1 into attempt from public.payments p where p.booking_id = b.id;
  ref := 'T' || replace(b.code, '-', '') || lpad(attempt::text, 2, '0');
  insert into public.payments (booking_id, provider, kind, status, amount, reference, note, recorded_by)
  values (b.id, 'bank_transfer',
          case when b.status = 'confirmed' then 'balance'
               when b.amount_paid + received >= b.total then 'full' else 'deposit' end::public.payment_kind,
          'pending', received, ref, clean_note, auth.uid())
  returning id into new_payment;
  result := public.record_payment_event('bank_transfer', 'assigned:' || e.id, e.payload, ref, received, e.event_key, true);
  if result ->> 'result' <> 'recorded' then
    raise exception 'not_unmatched';
  end if;
  update public.payments set note = clean_note, recorded_by = auth.uid() where id = new_payment;
  update public.webhook_events set error = 'assigned' where id = e.id;
  perform public.log_booking_event(b.id, 'transfer_assigned', null, null, ref || ' ' || received || ': ' || clean_note, auth.uid());
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, changes)
  values (auth.uid(), 'payments.assign_transfer', 'payments', new_payment,
          jsonb_build_object('booking', b.code, 'amount', received, 'event', e.event_key, 'note', clean_note));
  return result || jsonb_build_object('payment_id', new_payment, 'reference', ref);
end;
$$;

-- Cancelling is for operators and admins (ARCHITECTURE.md "Authorization"); sales request it.
create function public.staff_cancel_booking(target_id uuid, reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_act_as('{operator,admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.cancel_booking(target_id, auth.uid(), public.require_note(reason));
end;
$$;

create function public.request_cancellation(target_id uuid, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_note text;
begin
  if not public.can_act_as('{sales,sales_manager,operator,admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  clean_note := public.require_note(note);
  update public.bookings set needs_attention = true, attention_reason = 'cancel_requested'
   where id = target_id and status in ('draft', 'quoted', 'pending_payment', 'confirmed');
  if not found then
    raise exception 'not_cancellable';
  end if;
  perform public.log_booking_event(target_id, 'cancel_requested', null, null, clean_note, auth.uid());
end;
$$;

-- Clears a booking from the "needs attention" queue with a note on what was done.
create function public.resolve_attention(target_id uuid, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_note text;
  reason text;
begin
  if not public.can_act_as('{sales,sales_manager,operator,accountant,admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  clean_note := public.require_note(note);
  select attention_reason into reason from public.bookings where id = target_id and needs_attention for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.bookings set needs_attention = false, attention_reason = null where id = target_id;
  perform public.log_booking_event(target_id, 'attention_resolved', null, null, coalesce(reason, '') || ': ' || clean_note, auth.uid());
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.record_manual_payment(uuid, bigint, public.payment_provider, text)',
    'public.record_refund(uuid, bigint, public.payment_provider, text)',
    'public.assign_unmatched_transfer(uuid, uuid, text)',
    'public.staff_cancel_booking(uuid, text)',
    'public.request_cancellation(uuid, text)',
    'public.resolve_attention(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end;
$$;
