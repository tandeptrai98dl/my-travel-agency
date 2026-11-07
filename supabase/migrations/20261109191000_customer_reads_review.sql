-- PR #42 review (docs/specs/phase-5-accounts-inquiries-operations.md decision 6, ADR-037):
-- - attach_customer_bookings() was callable by any session through PostgREST, so with GoTrue
--   auto-confirming emails a direct /rest/v1/rpc call skipped the app's confirmation guard. It is
--   now service-role only and takes the user id, which the identity service passes from getUser()
--   after confirmationGuard() said confirmations are on.
-- - set_marketing_consent() stored any document version. It is now service-role only; the account
--   service calls it with the version of the published privacy policy it read itself.
-- - save_customer_travellers(): a birth date in the right shape that does not exist (2020-13-45)
--   raised 22008; it is now invalid_traveller like every other bad value.

-- Attach -------------------------------------------------------------------------------------------

drop function public.attach_customer_bookings();

-- Attaches earlier bookings made with the user's address. The address comes from auth.users by
-- `target_id`, only once GoTrue has confirmed it, and only for an active, not deleted profile.
-- Only bookings without an owner move. Returns the count.
create function public.attach_customer_bookings(target_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  address text;
  attached int := 0;
  target record;
begin
  if target_id is null
     or not exists (select 1 from public.profiles p where p.id = target_id and p.is_active and p.deleted_at is null) then
    return 0;
  end if;
  select lower(u.email) into address
    from auth.users u
   where u.id = target_id and u.email_confirmed_at is not null and u.email is not null;
  if address is null then
    return 0;
  end if;

  for target in
    update public.bookings
       set customer_id = target_id
     where customer_id is null and lower(contact_email) = address
    returning id
  loop
    perform public.log_booking_event(target.id, 'attached_to_account', null, null, null, target_id);
    attached := attached + 1;
  end loop;
  return attached;
end;
$$;

revoke execute on function public.attach_customer_bookings(uuid) from public, anon, authenticated;
grant execute on function public.attach_customer_bookings(uuid) to service_role;

-- Marketing choice ---------------------------------------------------------------------------------

drop function public.set_marketing_consent(boolean, text);

-- The account's marketing choice and its proof in one transaction. Service role only: the account
-- service checks the signed-in customer and passes the version of the published privacy policy.
create function public.set_marketing_consent(target_id uuid, granted boolean, document_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  address text;
begin
  if not exists (select 1 from public.profiles p where p.id = target_id and p.is_active and p.deleted_at is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if granted is null or document_version is null or document_version !~ '^privacy-(vi|en)-[0-9a-f]{16}$' then
    raise exception 'invalid_consent' using errcode = '22023';
  end if;
  select u.email into address from auth.users u where u.id = target_id;
  update public.profiles set marketing_consent = granted where id = target_id;
  insert into public.consent_records (subject_email, profile_id, purpose, granted, document_version)
  values (coalesce(address, ''), target_id, 'marketing', granted, document_version);
end;
$$;

revoke execute on function public.set_marketing_consent(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.set_marketing_consent(uuid, boolean, text) to service_role;

-- Travellers ----------------------------------------------------------------------------------------

-- True when `value` is a real calendar date in YYYY-MM-DD form.
create function public.is_real_date(value text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if value is null or value !~ '^\d{4}-\d{2}-\d{2}$' then
    return false;
  end if;
  return to_char(value::date, 'YYYY-MM-DD') = value;
exception
  when others then
    return false;
end;
$$;

revoke execute on function public.is_real_date(text) from public, anon, authenticated;
grant execute on function public.is_real_date(text) to service_role;

create or replace function public.save_customer_travellers(target_code text, travellers jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
  customer uuid := public.current_customer_id();
  t jsonb;
  saved int;
  allowed constant text[] := array['full_name', 'date_of_birth', 'nationality', 'dietary_notes', 'is_lead'];
begin
  if customer is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into b from public.bookings where code = target_code and customer_id = customer for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not public.customer_travellers_editable(b.status, b.start_date) then
    raise exception 'travellers_locked' using errcode = 'P0001';
  end if;
  if travellers is null or jsonb_typeof(travellers) <> 'array' then
    raise exception 'invalid_traveller' using errcode = '22023';
  end if;
  if jsonb_array_length(travellers) > b.adults + b.children + b.infants then
    raise exception 'too_many_travellers' using errcode = '22023';
  end if;

  for t in select value from jsonb_array_elements(travellers) loop
    if jsonb_typeof(t) <> 'object'
       or exists (select 1 from jsonb_object_keys(t) k where k <> all (allowed))
       or jsonb_typeof(t -> 'full_name') is distinct from 'string'
       or char_length(btrim(t ->> 'full_name')) not between 1 and 120
       or (t ? 'is_lead' and jsonb_typeof(t -> 'is_lead') <> 'boolean')
       or (t ->> 'nationality' is not null and char_length(t ->> 'nationality') > 60)
       or (t ->> 'dietary_notes' is not null and char_length(t ->> 'dietary_notes') > 500)
       or (t ->> 'date_of_birth' is not null and not public.is_real_date(t ->> 'date_of_birth')) then
      raise exception 'invalid_traveller' using errcode = '22023';
    end if;
    if t ->> 'date_of_birth' is not null
       and ((t ->> 'date_of_birth')::date > public.vietnam_today() or (t ->> 'date_of_birth')::date < date '1900-01-01') then
      raise exception 'invalid_traveller' using errcode = '22023';
    end if;
  end loop;

  if jsonb_array_length(travellers) > 0
     and (select count(*) from jsonb_array_elements(travellers) e where (e.value ->> 'is_lead')::boolean is true) <> 1 then
    raise exception 'lead_required' using errcode = '22023';
  end if;

  delete from public.travellers where booking_id = b.id;
  insert into public.travellers (booking_id, full_name, date_of_birth, nationality, dietary_notes, is_lead)
  select b.id, btrim(e.value ->> 'full_name'), (e.value ->> 'date_of_birth')::date,
         nullif(btrim(e.value ->> 'nationality'), ''), nullif(btrim(e.value ->> 'dietary_notes'), ''),
         coalesce((e.value ->> 'is_lead')::boolean, false)
    from jsonb_array_elements(travellers) e;
  get diagnostics saved = row_count;

  perform public.log_booking_event(b.id, 'travellers_updated', null, null, null, customer);
  return saved;
end;
$$;

revoke execute on function public.save_customer_travellers(text, jsonb) from public, anon;
grant execute on function public.save_customer_travellers(text, jsonb) to authenticated, service_role;
