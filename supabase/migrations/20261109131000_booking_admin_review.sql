-- Review of PR #29 (docs/specs/phase-4-booking-payments.md PR 4F):
--   * who may clear a "needs attention" flag depends on its reason: money reasons need an
--     MFA-verified accountant or admin, a cancellation request an operator or admin (sales none);
--   * a cancellation request never replaces a money reason; it comes back once that is resolved;
--   * staff cancellations are written to audit_logs with the suggested refund;
--   * money recorded by hand (or assigned) for a cancelled booking is flagged paid_after_cancel.

-- Roles that may resolve a reason. Anything that is not a cancellation request is about money,
-- including reasons added later, so the default is the strict one.
create function public.attention_resolvers(reason text)
returns public.user_role[]
language sql
immutable
set search_path = ''
as $$
  select case when reason = 'cancel_requested' then '{operator,admin}'::public.user_role[]
              else '{accountant,admin}'::public.user_role[] end
$$;

create or replace function public.resolve_attention(target_id uuid, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_note text;
  b public.bookings;
  last_resolved timestamptz;
begin
  if not public.can_act_as('{operator,accountant,admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  clean_note := public.require_note(note);
  select * into b from public.bookings where id = target_id and needs_attention for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not public.can_act_as(public.attention_resolvers(b.attention_reason)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select max(created_at) into last_resolved
    from public.booking_events where booking_id = b.id and type = 'attention_resolved';
  update public.bookings set needs_attention = false, attention_reason = null where id = b.id;
  perform public.log_booking_event(b.id, 'attention_resolved', null, null, coalesce(b.attention_reason, '') || ': ' || clean_note, auth.uid());
  -- A cancellation requested while a money reason was open comes back to the operators.
  if b.attention_reason is distinct from 'cancel_requested'
     and b.status in ('draft', 'quoted', 'pending_payment', 'confirmed')
     and exists (
       select 1 from public.booking_events e
        where e.booking_id = b.id and e.type = 'cancel_requested'
          and (last_resolved is null or e.created_at > last_resolved)
     ) then
    update public.bookings set needs_attention = true, attention_reason = 'cancel_requested' where id = b.id;
  end if;
end;
$$;

create or replace function public.request_cancellation(target_id uuid, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_note text;
  b public.bookings;
begin
  if not public.can_act_as('{sales,sales_manager,operator,admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  clean_note := public.require_note(note);
  select * into b from public.bookings
   where id = target_id and status in ('draft', 'quoted', 'pending_payment', 'confirmed') for update;
  if not found then
    raise exception 'not_cancellable';
  end if;
  -- Keep an open money reason; resolve_attention() raises the request again once it is cleared.
  if not b.needs_attention or b.attention_reason is null then
    update public.bookings set needs_attention = true, attention_reason = 'cancel_requested' where id = b.id;
  end if;
  perform public.log_booking_event(b.id, 'cancel_requested', null, null, clean_note, auth.uid());
end;
$$;

create or replace function public.staff_cancel_booking(target_id uuid, reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_reason text;
  result jsonb;
begin
  if not public.can_act_as('{operator,admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  clean_reason := public.require_note(reason);
  result := public.cancel_booking(target_id, auth.uid(), clean_reason);
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, changes)
  values (auth.uid(), 'bookings.cancel', 'bookings', target_id,
          jsonb_build_object('booking', (select code from public.bookings where id = target_id), 'reason', clean_reason,
                             'refund_percent', result -> 'refund_percent', 'refund_amount', result -> 'refund_amount'));
  return result;
end;
$$;

create or replace function public.record_manual_payment(target_id uuid, amount bigint, method public.payment_provider, note text)
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
  if b.status = 'cancelled' then
    -- Money for a cancelled booking is never left unnoticed: it waits for a refund (review of #29).
    update public.bookings set needs_attention = true, attention_reason = 'paid_after_cancel' where id = b.id;
    perform public.log_booking_event(b.id, 'needs_attention', b.status, b.status, 'paid_after_cancel', auth.uid());
    result := result || jsonb_build_object('needs_attention', true, 'attention_reason', 'paid_after_cancel');
  end if;
  perform public.log_booking_event(b.id, 'manual_payment', null, null, ref || ' ' || amount || ': ' || clean_note, auth.uid());
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, changes)
  values (auth.uid(), 'payments.manual_record', 'payments', new_payment,
          jsonb_build_object('booking', b.code, 'amount', amount, 'method', method, 'note', clean_note));
  return result || jsonb_build_object('payment_id', new_payment, 'reference', ref);
end;
$$;

create or replace function public.assign_unmatched_transfer(event_id uuid, target_id uuid, note text)
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
  if b.status = 'cancelled' then
    -- Money for a cancelled booking is never left unnoticed: it waits for a refund (review of #29).
    update public.bookings set needs_attention = true, attention_reason = 'paid_after_cancel' where id = b.id;
    perform public.log_booking_event(b.id, 'needs_attention', b.status, b.status, 'paid_after_cancel', auth.uid());
    result := result || jsonb_build_object('needs_attention', true, 'attention_reason', 'paid_after_cancel');
  end if;
  update public.webhook_events set error = 'assigned' where id = e.id;
  perform public.log_booking_event(b.id, 'transfer_assigned', null, null, ref || ' ' || received || ': ' || clean_note, auth.uid());
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, changes)
  values (auth.uid(), 'payments.assign_transfer', 'payments', new_payment,
          jsonb_build_object('booking', b.code, 'amount', received, 'event', e.event_key, 'note', clean_note));
  return result || jsonb_build_object('payment_id', new_payment, 'reference', ref);
end;
$$;

revoke execute on function public.attention_resolvers(text) from public, anon;
grant execute on function public.attention_resolvers(text) to authenticated, service_role;
