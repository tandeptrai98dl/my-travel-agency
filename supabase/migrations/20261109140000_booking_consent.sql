-- Terms and privacy acceptance at checkout (docs/specs/phase-4-booking-payments.md decision 9).
-- Called by the booking module with the service role right after the draft is created: one
-- consent_records row per purpose, with the version of the page the customer saw, and the same
-- terms version on the booking. Marketing is a separate, unticked box: a row only when ticked.
create function public.record_booking_consent(
  target_id uuid,
  terms_version text,
  privacy_version text,
  marketing boolean,
  ip inet,
  user_agent text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
begin
  if terms_version is null or privacy_version is null or terms_version = '' or privacy_version = '' then
    raise exception 'consent_required';
  end if;
  select * into b from public.bookings where id = target_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.bookings set terms_version = record_booking_consent.terms_version where id = b.id;
  insert into public.consent_records (subject_email, profile_id, purpose, granted, document_version, booking_id, ip, user_agent)
  values
    (b.contact_email, b.customer_id, 'terms', true, record_booking_consent.terms_version, b.id, ip, left(user_agent, 500)),
    (b.contact_email, b.customer_id, 'privacy', true, record_booking_consent.privacy_version, b.id, ip, left(user_agent, 500));
  if marketing then
    insert into public.consent_records (subject_email, profile_id, purpose, granted, document_version, booking_id, ip, user_agent)
    values (b.contact_email, b.customer_id, 'marketing', true, 'booking-' || record_booking_consent.privacy_version, b.id, ip, left(user_agent, 500));
  end if;
end;
$$;

revoke execute on function public.record_booking_consent(uuid, text, text, boolean, inet, text) from public, anon, authenticated;
grant execute on function public.record_booking_consent(uuid, text, text, boolean, inet, text) to service_role;

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
