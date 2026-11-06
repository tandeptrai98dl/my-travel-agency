-- Audit log for catalog, content, settings and staff changes (docs/specs/phase-2-catalog-admin.md,
-- decision 2; ARCHITECTURE.md "audit log with before/after values").
--
-- One generic row trigger writes public.audit_logs. API roles still cannot write audit_logs
-- directly (no insert policy, no grant): the trigger function runs as its owner.
--   actor_id    auth.uid() of the session (null for the service role, seeding and cron)
--   action      '<table>.<insert|update|delete>'
--   entity_type the table name
--   entity_id   the row's uuid; argument 1 names the column ('id' by default). Join tables log
--               against their tour; settings (text key) use md5(key)::uuid and keep the key in
--               `changes`.
--   changes     insert: {after}; delete: {before}; update: {before, after} with only the
--               columns that changed. Updates that change nothing are skipped.
-- Arguments: (id column, kept columns, ignored columns)
--   kept columns    '*' keeps every value; otherwise a comma list. Other changed columns are
--                   listed by name only (`changed` on update, `omitted` on insert and delete),
--                   never with their values (personal data,
--                   Decree 13/2023: anonymising a profile must not leave the old values here).
--   ignored columns changes to these alone are not logged (updated_at always; seats_reserved on
--                   departures, which Phase 4 functions move on every hold).
-- ip and user_agent stay null here: admin writes arrive through Server Actions, so the request
-- headers PostgREST sees are the server's own (and x-forwarded-for can be forged).

create function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  id_column text := coalesce(nullif(tg_argv[0], ''), 'id');
  kept text[] := case when coalesce(tg_argv[1], '*') = '*' then null
                      else string_to_array(tg_argv[1], ',') end;
  ignored text[] := array['updated_at'] || coalesce(string_to_array(nullif(tg_argv[2], ''), ','), '{}');
  old_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  row_data jsonb := coalesce(new_row, old_row);
  raw_id text := row_data ->> id_column;
  entity uuid;
  changed_keys text[];
  diff_before jsonb;
  diff_after jsonb;
  hidden_keys text[];
  changes jsonb;
begin
  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key)
    into changed_keys
    from jsonb_each(new_row) as n(key, value)
    where (old_row -> n.key) is distinct from n.value;
    -- Nothing changed, or only ignored columns.
    if changed_keys is null or changed_keys <@ ignored then
      return null;
    end if;
    select
      jsonb_object_agg(k, old_row -> k) filter (where kept is null or k = any (kept)),
      jsonb_object_agg(k, new_row -> k) filter (where kept is null or k = any (kept)),
      array_agg(k) filter (where kept is not null and not k = any (kept))
    into diff_before, diff_after, hidden_keys
    from unnest(changed_keys) as k
    where not k = any (ignored);
    changes := jsonb_build_object(
      'before', coalesce(diff_before, '{}'::jsonb),
      'after', coalesce(diff_after, '{}'::jsonb)
    );
  else
    select
      jsonb_object_agg(k, row_data -> k) filter (where kept is null or k = any (kept) or k = id_column),
      array_agg(k) filter (where kept is not null and not (k = any (kept) or k = id_column))
    into diff_after, hidden_keys
    from jsonb_object_keys(row_data) as k;
    changes := jsonb_build_object(case when tg_op = 'INSERT' then 'after' else 'before' end, diff_after);
  end if;
  if hidden_keys is not null then
    -- Updates: changed columns whose values are not kept. Inserts and deletes: columns left out.
    changes := changes || jsonb_build_object(
      case when tg_op = 'UPDATE' then 'changed' else 'omitted' end, to_jsonb(hidden_keys)
    );
  end if;

  if id_column = 'key' then
    entity := md5(raw_id)::uuid;
    changes := changes || jsonb_build_object('key', raw_id);
  else
    entity := raw_id::uuid;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, changes)
  values ((select auth.uid()), tg_table_name || '.' || lower(tg_op), tg_table_name, entity, changes);
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
    'tours', 'tour_translations', 'price_tiers', 'cancellation_policies',
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

-- Departures: seat counts move with every hold (Phase 4); only staff edits are worth logging.
create trigger audit_row_change
  after insert or update or delete on public.departures
  for each row execute function public.audit_row_change('id', '*', 'seats_reserved');

create trigger audit_row_change
  after insert or update or delete on public.settings
  for each row execute function public.audit_row_change('key');

-- Profiles: values only for role and status; personal-data columns are named, never copied
-- (not the automatic sign-up insert).
create trigger audit_row_change
  after update or delete on public.profiles
  for each row execute function public.audit_row_change('id', 'role,is_active,deleted_at', '');

-- The audit log must not block deleting a user (data deletion on request): keep the entry and
-- drop the link to the person.
alter table public.audit_logs drop constraint audit_logs_actor_id_fkey;
alter table public.audit_logs
  add constraint audit_logs_actor_id_fkey
  foreign key (actor_id) references public.profiles (id) on delete set null;
