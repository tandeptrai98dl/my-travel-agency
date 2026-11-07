-- Contact form (Phase 3 PR K; FEATURES "Contact page"): a guest write per ARCHITECTURE "Guest
-- writes". The Server Action validates with Zod, verifies Turnstile and rate-limits, then calls
-- create_contact_inquiry() with the service role. The inquiry inbox, assignment and the other
-- inquiry sources (tailor-made wizard, tour inquiries) are Phase 5 (Stream A); this adds only
-- the code sequence and the write path. No table, policy or grant changes.

create sequence if not exists public.inquiry_code_seq;
revoke all on sequence public.inquiry_code_seq from public, anon, authenticated;

-- Inquiry codes like INQ-2611-0042 (month in Vietnam time); shared with Phase 5's inquiry sources.
create or replace function public.next_inquiry_code()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select 'INQ-' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYMM') || '-'
         || lpad(nextval('public.inquiry_code_seq')::text, 4, '0')
$$;

-- Saves a contact message as an inquiry (`source = 'contact'`, no traveller numbers) and records
-- the privacy-policy consent given with it (Decree 13/2023 proof) in the same transaction.
-- Returns the inquiry code. A tour code that is not a published tour is ignored.
create or replace function public.create_contact_inquiry(
  p_name text,
  p_email text,
  p_phone text,
  p_preferred_contact text,
  p_message text,
  p_locale public.locale,
  p_tour_code text,
  p_privacy_version text,
  p_ip inet default null,
  p_user_agent text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_email text := lower(btrim(p_email));
  v_phone text := nullif(btrim(p_phone), '');
  v_message text := btrim(p_message);
  v_tour uuid;
  v_id uuid;
  v_code text;
begin
  if v_name is null or char_length(v_name) not between 1 and 120 then
    raise exception 'invalid name' using errcode = '22023';
  end if;
  if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  if v_phone is not null and v_phone !~ '^[+0-9 ().-]{6,30}$' then
    raise exception 'invalid phone' using errcode = '22023';
  end if;
  if p_preferred_contact is not null and p_preferred_contact not in ('email', 'phone', 'zalo', 'whatsapp') then
    raise exception 'invalid preferred contact' using errcode = '22023';
  end if;
  if v_message is null or char_length(v_message) not between 10 and 4000 then
    raise exception 'invalid message' using errcode = '22023';
  end if;
  if p_locale is null or p_privacy_version is null or btrim(p_privacy_version) = '' then
    raise exception 'locale and privacy version required' using errcode = '22023';
  end if;

  if p_tour_code is not null then
    select id into v_tour from public.tours where code = btrim(p_tour_code) and status = 'published';
  end if;

  v_code := public.next_inquiry_code();
  insert into public.inquiries (code, name, email, phone, preferred_contact, tour_id, message, locale, source, adults)
  values (v_code, v_name, v_email, v_phone, p_preferred_contact, v_tour, v_message, p_locale, 'contact', null)
  returning id into v_id;

  insert into public.consent_records (subject_email, purpose, granted, document_version, inquiry_id, ip, user_agent)
  values (v_email, 'privacy', true, p_privacy_version, v_id, p_ip, left(p_user_agent, 500));

  return v_code;
end;
$$;

comment on function public.create_contact_inquiry(text, text, text, text, text, public.locale, text, text, inet, text) is
  'Contact form (service role only): saves an inquiry with source contact and records the privacy consent; returns the code.';

revoke execute on function public.next_inquiry_code() from public, anon, authenticated;
grant execute on function public.next_inquiry_code() to service_role;
revoke execute on function public.create_contact_inquiry(text, text, text, text, text, public.locale, text, text, inet, text) from public, anon, authenticated;
grant execute on function public.create_contact_inquiry(text, text, text, text, text, public.locale, text, text, inet, text) to service_role;
