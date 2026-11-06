-- Audit log for catalog, content, settings and staff changes (docs/specs/phase-2-catalog-admin.md,
-- decision 2; ARCHITECTURE.md "audit log with before/after values").
--
-- One generic row trigger writes public.audit_logs. API roles still cannot write audit_logs
-- directly (no insert policy, no grant): the trigger function runs as its owner.
--   actor_id    auth.uid() of the session (null for the service role, seeding and cron)
--   action      '<table>.<insert|update|delete>'
--   entity_type the table name
--   entity_id   the row's uuid; tg_argv[0] names the column ('id' by default). Join tables log
--               against their tour; settings (text key) use md5(key)::uuid and keep the key in
--               `changes`.
--   changes     insert: {after}; delete: {before}; update: {before, after} with only the
--               columns that changed (updated_at ignored). Updates that change nothing are skipped.
--   ip, user_agent from the PostgREST request headers when present.

create function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  id_column text := coalesce(tg_argv[0], 'id');
  old_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  row_data jsonb := coalesce(new_row, old_row);
  raw_id text := row_data ->> id_column;
  entity uuid;
  diff_before jsonb;
  diff_after jsonb;
  changes jsonb;
  headers jsonb;
  forwarded text;
  client_ip inet;
begin
  if tg_op = 'UPDATE' then
    select
      jsonb_object_agg(n.key, old_row -> n.key),
      jsonb_object_agg(n.key, n.value)
    into diff_before, diff_after
    from jsonb_each(new_row) as n(key, value)
    where n.key <> 'updated_at'
      and (old_row -> n.key) is distinct from n.value;
    if diff_after is null then
      return null;
    end if;
    changes := jsonb_build_object('before', diff_before, 'after', diff_after);
  elsif tg_op = 'INSERT' then
    changes := jsonb_build_object('after', new_row);
  else
    changes := jsonb_build_object('before', old_row);
  end if;

  if id_column = 'key' then
    entity := md5(raw_id)::uuid;
    changes := changes || jsonb_build_object('key', raw_id);
  else
    entity := raw_id::uuid;
  end if;

  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    headers := null;
  end;
  forwarded := split_part(coalesce(headers ->> 'x-forwarded-for', headers ->> 'x-real-ip', ''), ',', 1);
  begin
    client_ip := nullif(trim(forwarded), '')::inet;
  exception when others then
    client_ip := null;
  end;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, changes, ip, user_agent)
  values (
    (select auth.uid()),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    entity,
    changes,
    client_ip,
    left(headers ->> 'user-agent', 500)
  );
  return null;
end;
$$;

revoke execute on function public.audit_row_change() from public, anon, authenticated;

-- Tables audited on insert, update and delete, keyed by their own uuid.
do $$
declare
  t text;
begin
  foreach t in array array[
    'tours', 'tour_translations', 'price_tiers', 'departures', 'cancellation_policies',
    'destinations', 'destination_translations', 'travel_styles', 'travel_style_translations',
    'posts', 'post_translations', 'post_categories', 'post_category_translations', 'pages',
    'page_translations', 'reviews', 'media', 'redirects'
  ] loop
    execute format(
      'create trigger audit_row_change after insert or update or delete on public.%I '
      'for each row execute function public.audit_row_change()', t);
  end loop;

  -- Join tables: logged against their tour.
  foreach t in array array['tour_media', 'tour_destinations', 'tour_travel_styles'] loop
    execute format(
      'create trigger audit_row_change after insert or update or delete on public.%I '
      'for each row execute function public.audit_row_change(%L)', t, 'tour_id');
  end loop;
end;
$$;

create trigger audit_row_change
  after insert or update or delete on public.settings
  for each row execute function public.audit_row_change('key');

-- Profiles: role, activation and personal-data edits (not the automatic sign-up insert).
create trigger audit_row_change
  after update or delete on public.profiles
  for each row execute function public.audit_row_change();
