-- Guest booking lookup and customer data deletion (Phase 5 PR 5B, spec decisions 7 and 8, ADR-037,
-- ADR-038).
--
-- * issue_booking_lookup(): a single-use lookup token (purpose `lookup` in booking_access_tokens)
--   only when the code and the address match a booking, at most 3 open per booking.
-- * request_customer_deletion(), customer_deletion_state(): the request and the state of its steps.
-- * anonymise_customer(): every SQL change of decision 8 in one transaction, idempotent; with an
--   MFA-verified admin wrapper for requests that had to wait.
-- * handle_user_email_change() leaves deleted profiles alone: GoTrue's soft delete obfuscates the
--   Auth address, which must not overwrite the anonymised profile address.
-- * Reviews are audited without the reviewer's name, title and text (named only), and anonymising
--   removes the name from earlier review audit rows, so no deleted name stays in audit_logs.
-- * update_inquiry_status(): the first non-spam status change sets the first response, also after
--   spam (#45 review).
-- All service-role functions: security definer, search_path '', execute for service_role only.

-- Lookup ---------------------------------------------------------------------------------------
create function public.issue_booking_lookup(target_code text, email text, token_hash text, valid_minutes int default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
  minutes int := valid_minutes;
  token public.booking_access_tokens;
begin
  if token_hash is null or token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_token';
  end if;
  select * into b from public.bookings
   where code = upper(trim(coalesce(target_code, '')))
     and lower(contact_email) = lower(trim(coalesce(issue_booking_lookup.email, '')))
   for update;
  if not found then
    return null;
  end if;
  if (select count(*) from public.booking_access_tokens t
       where t.booking_id = b.id and t.purpose = 'lookup' and t.used_at is null and t.expires_at > now()) >= 3 then
    return null;
  end if;
  if minutes is null then
    select (s.value ->> 'booking_lookup_link_minutes')::int into minutes
      from public.settings s where s.key = 'booking_rules' and jsonb_typeof(s.value -> 'booking_lookup_link_minutes') = 'number';
  end if;
  minutes := least(greatest(coalesce(minutes, 30), 10), 120);
  insert into public.booking_access_tokens (booking_id, purpose, token_hash, expires_at)
  values (b.id, 'lookup', issue_booking_lookup.token_hash, now() + make_interval(mins => minutes))
  returning * into token;
  return jsonb_build_object('token_id', token.id, 'booking_id', b.id, 'code', b.code, 'locale', b.locale, 'expires_at', token.expires_at);
end;
$$;

-- Deletion: request and state ------------------------------------------------------------------
-- The customer's confirmed Auth address (decision 6), or null.
create function public.confirmed_customer_email(target_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email) from auth.users u
   where u.id = target_id and u.email_confirmed_at is not null and u.deleted_at is null and u.email is not null
$$;

-- Records the request (once) and returns why it must wait: a journey ahead, a payment in progress,
-- a balance due or an open money reason in the attention queue. Customers only.
create function public.request_customer_deletion(target_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  address text := public.confirmed_customer_email(target_id);
  reasons text[] := '{}';
begin
  select * into p from public.profiles where id = target_id for update;
  if not found or p.role <> 'customer' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p.deletion_requested_at is null then
    update public.profiles set deletion_requested_at = now() where id = p.id;
  end if;
  select coalesce(array_agg(distinct reason order by reason), '{}') into reasons
    from (
      select case
               when b.status = 'pending_payment' then 'open_payment'
               when b.status = 'confirmed' and b.amount_paid < b.total then 'balance_due'
               when b.status in ('quoted', 'confirmed') and b.start_date >= public.vietnam_today() then 'upcoming_trip'
             end as reason
        from public.bookings b
       where b.customer_id = p.id or (address is not null and lower(b.contact_email) = address)
      union all
      select 'attention' from public.bookings b
       where (b.customer_id = p.id or (address is not null and lower(b.contact_email) = address))
         and b.needs_attention and coalesce(b.attention_reason, '') <> 'cancel_requested'
    ) r
   where reason is not null;
  return reasons;
end;
$$;

create function public.customer_deletion_state(target_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'role', p.role,
    'requested', p.deletion_requested_at is not null,
    'profile_deleted', p.deleted_at is not null,
    'auth_deleted', coalesce((select u.deleted_at is not null from auth.users u where u.id = p.id), true)
  )
  from public.profiles p where p.id = target_id
$$;

-- Deletion: the SQL step ------------------------------------------------------------------------
-- "Nguyễn Văn An" → "N. V. A."; already reduced names stay as they are.
create function public.name_initials(full_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(string_agg(upper(left(word, 1)) || '.', ' ' order by n), '')
    from regexp_split_to_table(trim(coalesce(full_name, '')), '\s+') with ordinality as w(word, n)
   where word <> ''
$$;

create function public.anonymise_customer(target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  address text;
  placeholder text := 'deleted+' || target_id::text || '@invalid.local';
  booking_ids uuid[];
  review_ids uuid[];
  inquiry_ids uuid[];
  counts jsonb;
  n_profile int := 0;
  n_bookings int := 0;
  n_inquiries int := 0;
  n_notes int := 0;
  n_subscribers int := 0;
  n_emails int := 0;
  n_reviews int := 0;
  n_tokens int := 0;
  had_marketing boolean;
begin
  select * into p from public.profiles where id = target_id for update;
  if not found or p.role <> 'customer' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- The address the customer proved (decision 6); after a first run the profile no longer has it.
  address := coalesce(public.confirmed_customer_email(target_id), nullif(lower(p.email), lower(placeholder)));
  if address = lower(placeholder) then
    address := null;
  end if;

  select coalesce(array_agg(b.id), '{}') into booking_ids from public.bookings b
   where b.customer_id = p.id or (address is not null and lower(b.contact_email) = address);

  -- Reviews on those bookings: initials only; earlier audit rows lose the name, country, title and text.
  select coalesce(array_agg(r.id), '{}') into review_ids from public.reviews r
   where r.booking_id = any (booking_ids) and r.author_name is distinct from public.name_initials(r.author_name);
  update public.reviews set author_name = public.name_initials(author_name) where id = any (review_ids);
  get diagnostics n_reviews = row_count;
  update public.audit_logs
     set changes = changes
       #- '{before,author_name}' #- '{after,author_name}'
       #- '{before,author_country}' #- '{after,author_country}'
       #- '{before,title}' #- '{after,title}'
       #- '{before,content}' #- '{after,content}'
   where entity_type = 'reviews'
     and entity_id in (select r.id from public.reviews r where r.booking_id = any (booking_ids))
     and (changes -> 'before' ?| array['author_name', 'author_country', 'title', 'content']
          or changes -> 'after' ?| array['author_name', 'author_country', 'title', 'content']);

  -- Unused access tokens of those bookings.
  delete from public.booking_access_tokens where booking_id = any (booking_ids) and used_at is null;
  get diagnostics n_tokens = row_count;

  -- Bookings are kept for the retention period, unlinked from the account.
  update public.bookings set customer_id = null where customer_id = p.id;
  get diagnostics n_bookings = row_count;

  -- Inquiries without a booking are anonymised; their notes go.
  if address is not null then
    select coalesce(array_agg(i.id), '{}') into inquiry_ids from public.inquiries i
     where lower(i.email) = address and not exists (select 1 from public.bookings b where b.inquiry_id = i.id);
    update public.inquiries
       set name = 'Đã xoá', email = placeholder, phone = null, country = null, company_name = null,
           message = null, destinations_other = null, utm = null
     where id = any (inquiry_ids);
    get diagnostics n_inquiries = row_count;
  end if;
  delete from public.internal_notes where customer_id = p.id or inquiry_id = any (coalesce(inquiry_ids, '{}'));
  get diagnostics n_notes = row_count;

  -- Newsletter: the row goes, the withdrawal is kept as proof.
  had_marketing := p.marketing_consent;
  if address is not null then
    delete from public.subscribers where lower(email) = address;
    get diagnostics n_subscribers = row_count;
    if n_subscribers > 0 or had_marketing then
      insert into public.consent_records (subject_email, profile_id, purpose, granted, document_version)
      values (address, p.id, 'marketing', false, 'account-deletion');
    end if;
    update public.email_logs set to_email = placeholder where lower(to_email) = address;
    get diagnostics n_emails = row_count;
  end if;

  -- The profile stays as a row for foreign keys.
  update public.profiles
     set full_name = null, phone = null, country = null, avatar_url = null, email = placeholder,
         marketing_consent = false, deleted_at = coalesce(deleted_at, now())
   where id = p.id
     and (full_name, phone, country, avatar_url, email, marketing_consent, deleted_at is not null)
         is distinct from (null::text, null::text, null::text, null::text, placeholder, false, true);
  get diagnostics n_profile = row_count;

  counts := jsonb_build_object(
    'profile', n_profile, 'bookings_unlinked', n_bookings, 'inquiries', n_inquiries, 'notes', n_notes,
    'subscribers', n_subscribers, 'email_logs', n_emails, 'reviews', n_reviews, 'tokens', n_tokens
  );
  if n_profile + n_bookings + n_inquiries + n_notes + n_subscribers + n_emails + n_reviews + n_tokens > 0 then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, changes)
    values (auth.uid(), 'customers.anonymise', 'profiles', p.id, jsonb_build_object('counts', counts));
  end if;
  return counts;
end;
$$;

-- The admin's way to finish a request that had to wait (spec decision 8): MFA-verified admin, a
-- note, a request on record. The Auth steps around it run in the identity service.
create function public.admin_anonymise_customer(target_id uuid, note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_note text;
  counts jsonb;
begin
  if not public.can_act_as('{admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  clean_note := public.require_note(note);
  if not exists (select 1 from public.profiles where id = target_id and role = 'customer' and deletion_requested_at is not null) then
    raise exception 'not_requested' using errcode = 'P0002';
  end if;
  counts := public.anonymise_customer(target_id);
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, changes)
  values (auth.uid(), 'customers.anonymise_by_admin', 'profiles', target_id, jsonb_build_object('note', clean_note, 'counts', counts));
  return counts;
end;
$$;

-- GoTrue's soft delete obfuscates the address: a deleted profile keeps its placeholder.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id and deleted_at is null;
  return new;
end;
$$;

-- Reviews: values for the moderation columns only; the reviewer's name, country, title and text
-- are named, never copied (they are the customer's personal data, decision 8).
drop trigger audit_row_change on public.reviews;
create trigger audit_row_change
  after insert or update or delete on public.reviews
  for each row execute function public.audit_row_change('id', 'id,tour_id,booking_id,rating,locale,travel_date,is_verified,status,is_featured,created_at', '');

-- #45 review: an inquiry marked spam and then contacted (new → spam → contacted) never got its
-- first response, because only a change away from new counted. Any non-spam change sets it once.
create or replace function public.update_inquiry_status(target_id uuid, new_status public.inquiry_status, note text default null)
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
           when i.first_responded_at is null and new_status <> 'spam' then now()
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


-- Grants ----------------------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.issue_booking_lookup(text, text, text, int)',
    'public.confirmed_customer_email(uuid)',
    'public.request_customer_deletion(uuid)',
    'public.customer_deletion_state(uuid)',
    'public.anonymise_customer(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
  execute 'revoke execute on function public.admin_anonymise_customer(uuid, text) from public, anon';
  execute 'grant execute on function public.admin_anonymise_customer(uuid, text) to authenticated, service_role';
end;
$$;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;

comment on function public.issue_booking_lookup(text, text, text, int) is
  'Guest lookup (service role): stores a lookup token hash only when code and email match a booking with fewer than 3 open lookup tokens; returns the token and booking ids and the locale, or null.';
comment on function public.anonymise_customer(uuid) is
  'Customer deletion, SQL step (service role): every table of spec Phase 5 decision 8 in one transaction; idempotent; returns counts.';
