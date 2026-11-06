-- Settings rules (docs/specs/phase-2-catalog-admin.md step 21, ADR-032).

-- Settings that must never be readable by visitors (RLS shows `is_public` rows to anon).
alter table public.settings
  add constraint settings_private_keys check (key not in ('bank_account', 'booking_rules') or not is_public);
