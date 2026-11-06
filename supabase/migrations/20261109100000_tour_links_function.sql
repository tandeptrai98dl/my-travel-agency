-- Phase 2 polish (PR 11 backlog): a tour's gallery, destinations and travel styles change in one
-- transaction, so a failure partway (an image deleted meanwhile, a destination removed) leaves
-- the links as they were instead of half applied.

-- Security invoker: RLS on tour_media, tour_destinations and tour_travel_styles still decides who
-- may write (editor and admin), and the audit trigger records the caller. Only real changes are
-- written: unchanged rows are not touched, so the audit log shows only what moved.
create function public.set_tour_links(
  target_id uuid,
  media_ids uuid[],
  destination_ids uuid[],
  travel_style_ids uuid[]
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- Gallery: new and reordered images first (sort order = position in the list), then removals.
  insert into public.tour_media (tour_id, media_id, sort_order)
  select target_id, m.id, m.position - 1
    from (
      select id, min(position) as position
        from unnest(coalesce(media_ids, '{}')) with ordinality as u (id, position)
       group by id
    ) m
  on conflict (tour_id, media_id) do update
    set sort_order = excluded.sort_order
    where public.tour_media.sort_order is distinct from excluded.sort_order;
  delete from public.tour_media
   where tour_id = target_id and media_id <> all (coalesce(media_ids, '{}'));

  delete from public.tour_destinations
   where tour_id = target_id and destination_id <> all (coalesce(destination_ids, '{}'));
  insert into public.tour_destinations (tour_id, destination_id)
  select distinct target_id, d from unnest(coalesce(destination_ids, '{}')) as d
  on conflict do nothing;

  delete from public.tour_travel_styles
   where tour_id = target_id and travel_style_id <> all (coalesce(travel_style_ids, '{}'));
  insert into public.tour_travel_styles (tour_id, travel_style_id)
  select distinct target_id, s from unnest(coalesce(travel_style_ids, '{}')) as s
  on conflict do nothing;
end;
$$;

revoke execute on function public.set_tour_links(uuid, uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.set_tour_links(uuid, uuid[], uuid[], uuid[]) to authenticated, service_role;
