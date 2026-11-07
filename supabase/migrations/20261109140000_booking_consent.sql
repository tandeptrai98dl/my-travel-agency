-- The book-now draft and its consent in one transaction (docs/specs/phase-4-booking-payments.md
-- decisions 2 and 9): create_draft_booking(), then one consent_records row per document with the
-- version of the published page the customer saw, and the terms version on the booking.
-- Marketing is a separate, unticked box: a row only when ticked. A replay with the same
-- idempotency key returns the same booking and records nothing twice. The privacy policy must be
-- published; the terms are recorded when a terms page is published (null otherwise).
create function public.create_checkout_draft(
  payload jsonb,
  terms_version text,
  privacy_version text,
  marketing boolean,
  ip inet,
  user_agent text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
  new_id uuid;
begin
  if privacy_version is null or privacy_version = '' or terms_version = '' then
    raise exception 'consent_required';
  end if;
  new_id := public.create_draft_booking(payload);
  select * into b from public.bookings where id = new_id for update;
  if exists (select 1 from public.consent_records c where c.booking_id = b.id) then
    return b.id;
  end if;
  update public.bookings set terms_version = create_checkout_draft.terms_version where id = b.id;
  insert into public.consent_records (subject_email, profile_id, purpose, granted, document_version, booking_id, ip, user_agent)
  select b.contact_email, b.customer_id, v.purpose, true, v.version, b.id, ip, left(user_agent, 500)
    from (values
      ('terms'::public.consent_purpose, create_checkout_draft.terms_version),
      ('privacy'::public.consent_purpose, create_checkout_draft.privacy_version),
      ('marketing'::public.consent_purpose, case when marketing then create_checkout_draft.privacy_version end)
    ) as v(purpose, version)
   where v.version is not null;
  return b.id;
end;
$$;

revoke execute on function public.create_checkout_draft(jsonb, text, text, boolean, inet, text) from public, anon, authenticated;
grant execute on function public.create_checkout_draft(jsonb, text, text, boolean, inet, text) to service_role;

-- The checkout result page polls this instead of reading the booking row (no personal data).
create function public.booking_checkout_status(target_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('status', b.status, 'payment_state', b.payment_state, 'amount_paid', b.amount_paid,
                            'total', b.total, 'hold_expires_at', b.hold_expires_at)
    from public.bookings b
   where b.code = target_code
$$;

revoke execute on function public.booking_checkout_status(text) from public, anon, authenticated;
grant execute on function public.booking_checkout_status(text) to service_role;
