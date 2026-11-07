-- Phase 5 PR 5A (docs/specs/phase-5-accounts-inquiries-operations.md decisions 1, 4–6): customers
-- read their bookings only through definer functions with a fixed set of columns, edit travellers
-- through one function, and get earlier guest bookings attached once their address is confirmed.
-- Closes the Phase 0 limit on customer reads of internal booking and payment columns.

-- Profiles ---------------------------------------------------------------------------------------

-- Set when a customer asks for deletion (PR 5B runs it); never writable by API roles.
alter table public.profiles add column deletion_requested_at timestamptz;

-- Column grants: RLS picks the rows, grants pick the columns. Customers edit their own name,
-- phone, country, avatar and language; the admin's staff page edits role, is_active, deleted_at
-- and email (still guarded by guard_profile_update() and keep_active_admin()). marketing_consent
-- changes only through set_marketing_consent() (with its consent row), deletion_requested_at only
-- through the service role.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone, country, avatar_url, locale, role, is_active, deleted_at, email)
  on public.profiles to authenticated;

create or replace function public.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if (new.role, new.is_active, new.deleted_at, new.email)
       is distinct from (old.role, old.is_active, old.deleted_at, old.email)
     and not public.can_act_as('{admin}') then
    raise exception 'only an admin can change role, is_active, deleted_at or email'
      using errcode = '42501';
  end if;

  -- Consent and deletion state change only in definer functions or the service role (decision 5).
  if (new.marketing_consent, new.deletion_requested_at)
       is distinct from (old.marketing_consent, old.deletion_requested_at) then
    raise exception 'marketing_consent and deletion_requested_at change only through their functions'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'id and created_at cannot change' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_profile_update() from public, anon, authenticated;

-- Direct customer policies (decision 5) -----------------------------------------------------------

drop policy "bookings: customer read own" on public.bookings;
drop policy "booking_items: customer read own" on public.booking_items;
drop policy "payments: customer read own" on public.payments;
drop policy "travellers: customer read own" on public.travellers;
drop policy "travellers: customer insert own before departure" on public.travellers;
drop policy "travellers: customer update own before departure" on public.travellers;

-- Helpers -------------------------------------------------------------------------------------------

-- The signed-in user, when their profile is active and not deleted (an access token outlives a
-- deletion by up to its expiry), else null.
create function public.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
    from public.profiles p
   where p.id = auth.uid() and p.is_active and p.deleted_at is null
$$;

-- Whether a booking's travellers may still be changed by its customer: before the departure date
-- (Vietnam), and only while the booking is open.
create function public.customer_travellers_editable(booking_status public.booking_status, start_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select booking_status in ('draft', 'quoted', 'pending_payment', 'confirmed')
     and start_date > public.vietnam_today()
$$;

-- Reads ---------------------------------------------------------------------------------------------

create function public.customer_bookings()
returns table (
  code text,
  status public.booking_status,
  payment_state public.booking_payment_state,
  tour_code text,
  tour_title text,
  start_date date,
  end_date date,
  adults int,
  children int,
  infants int,
  total bigint,
  amount_paid bigint,
  balance_due_date date,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.code, b.status, b.payment_state,
         b.tour_snapshot ->> 'code', b.tour_snapshot ->> 'title',
         b.start_date, nullif(b.tour_snapshot ->> 'end_date', '')::date,
         b.adults, b.children, b.infants, b.total, b.amount_paid, b.balance_due_date, b.created_at
    from public.bookings b
   where b.customer_id = public.current_customer_id()
   order by b.start_date desc, b.created_at desc
$$;

create function public.customer_booking(target_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'code', b.code,
           'status', b.status,
           'payment_state', b.payment_state,
           'type', b.type,
           'locale', b.locale,
           'tour_code', b.tour_snapshot ->> 'code',
           'tour_title', b.tour_snapshot ->> 'title',
           'start_date', b.start_date,
           'end_date', nullif(b.tour_snapshot ->> 'end_date', '')::date,
           'adults', b.adults,
           'children', b.children,
           'infants', b.infants,
           'single_rooms', b.single_rooms,
           'contact_name', b.contact_name,
           'contact_email', b.contact_email,
           'contact_phone', b.contact_phone,
           'total', b.total,
           'deposit_amount', b.deposit_amount,
           'amount_paid', b.amount_paid,
           'payment_plan', b.payment_plan,
           'balance_due_date', b.balance_due_date,
           'created_at', b.created_at,
           'cancellation_summary', b.cancellation_policy_snapshot -> 'summary',
           'travellers_editable', public.customer_travellers_editable(b.status, b.start_date),
           'items', coalesce((
             select jsonb_agg(jsonb_build_object('type', i.type, 'label', i.label, 'unit_price', i.unit_price,
                                                 'quantity', i.quantity, 'amount', i.amount) order by i.id)
               from public.booking_items i where i.booking_id = b.id), '[]'::jsonb),
           'travellers', coalesce((
             select jsonb_agg(jsonb_build_object('full_name', t.full_name, 'date_of_birth', t.date_of_birth,
                                                 'nationality', t.nationality, 'dietary_notes', t.dietary_notes,
                                                 'is_lead', t.is_lead) order by t.is_lead desc, t.full_name, t.id)
               from public.travellers t where t.booking_id = b.id), '[]'::jsonb),
           'payments', coalesce((
             select jsonb_agg(jsonb_build_object('amount', p.amount, 'kind', p.kind, 'provider', p.provider,
                                                 'status', p.status, 'paid_at', p.paid_at, 'created_at', p.created_at)
                              order by p.created_at)
               from public.payments p where p.booking_id = b.id), '[]'::jsonb)
         )
    from public.bookings b
   where b.code = target_code and b.customer_id = public.current_customer_id()
$$;

-- Writes --------------------------------------------------------------------------------------------

-- Replaces a booking's travellers (decision 4): at most adults + children + infants rows, each
-- with a name and only the known keys (never a passport number), exactly one lead when there are
-- any, before the departure date. Returns the number of rows saved.
create function public.save_customer_travellers(target_code text, travellers jsonb)
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
       or (t ->> 'date_of_birth' is not null and (t ->> 'date_of_birth') !~ '^\d{4}-\d{2}-\d{2}$') then
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

-- Attaches earlier bookings made with the caller's address (decision 6). The address comes from
-- auth.users, looked up by auth.uid(): never from the JWT `email` claim or profiles.email, and
-- only once GoTrue has confirmed it. Only bookings without an owner move. Returns the count.
create function public.attach_customer_bookings()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer uuid := public.current_customer_id();
  address text;
  attached int := 0;
  target record;
begin
  if customer is null then
    return 0;
  end if;
  select lower(u.email) into address
    from auth.users u
   where u.id = customer and u.email_confirmed_at is not null and u.email is not null;
  if address is null then
    return 0;
  end if;

  for target in
    update public.bookings
       set customer_id = customer
     where customer_id is null and lower(contact_email) = address
    returning id
  loop
    perform public.log_booking_event(target.id, 'attached_to_account', null, null, null, customer);
    attached := attached + 1;
  end loop;
  return attached;
end;
$$;

-- A change of the marketing choice from the account area (decision 4): the flag and its proof in
-- one transaction, with the version of the published privacy policy the page showed.
create function public.set_marketing_consent(granted boolean, document_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer uuid := public.current_customer_id();
  address text;
begin
  if customer is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if granted is null or document_version is null or char_length(document_version) not between 1 and 100 then
    raise exception 'invalid_consent' using errcode = '22023';
  end if;
  select u.email into address from auth.users u where u.id = customer;
  update public.profiles set marketing_consent = granted where id = customer;
  insert into public.consent_records (subject_email, profile_id, purpose, granted, document_version)
  values (coalesce(address, ''), customer, 'marketing', granted, document_version);
end;
$$;

-- Sign-up consent (decision 1): written by the identity service with the service role right after
-- GoTrue created the user, before any session exists. Records privacy (required) and marketing
-- when ticked, and sets the marketing flag. Writes nothing twice for the same user.
create function public.record_signup_consent(
  target_id uuid,
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
  address text;
begin
  if privacy_version is null or char_length(privacy_version) not between 1 and 100 then
    raise exception 'invalid_consent' using errcode = '22023';
  end if;
  select u.email into address from auth.users u where u.id = target_id;
  if address is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.consent_records c where c.profile_id = target_id and c.purpose = 'privacy') then
    return;
  end if;
  insert into public.consent_records (subject_email, profile_id, purpose, granted, document_version, ip, user_agent)
  values (address, target_id, 'privacy', true, privacy_version, ip, left(user_agent, 500));
  if marketing then
    insert into public.consent_records (subject_email, profile_id, purpose, granted, document_version, ip, user_agent)
    values (address, target_id, 'marketing', true, privacy_version, ip, left(user_agent, 500));
    update public.profiles set marketing_consent = true where id = target_id;
  end if;
end;
$$;

-- Privileges ------------------------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.current_customer_id()',
    'public.customer_travellers_editable(public.booking_status, date)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;

  foreach fn in array array[
    'public.customer_bookings()',
    'public.customer_booking(text)',
    'public.save_customer_travellers(text, jsonb)',
    'public.attach_customer_bookings()',
    'public.set_marketing_consent(boolean, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;

  execute 'revoke execute on function public.record_signup_consent(uuid, text, boolean, inet, text) from public, anon, authenticated';
  execute 'grant execute on function public.record_signup_consent(uuid, text, boolean, inet, text) to service_role';
end;
$$;
