-- Storage buckets and policies (docs/DATABASE.md "Storage").
--   media:   public read; editor and admin write. Images only, no SVG (ARCHITECTURE.md security).
--   private: no public access; files are served through signed URLs created by the service role
--            (vouchers and PDF quotes, P1), so it has no policies for API roles.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('media', 'media', true, 20971520, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('private', 'private', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy "media bucket: staff insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (select public.can_act_as('{editor,admin}')));

create policy "media bucket: staff update" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and (select public.can_act_as('{editor,admin}')))
  with check (bucket_id = 'media' and (select public.can_act_as('{editor,admin}')));

create policy "media bucket: staff delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (select public.can_act_as('{editor,admin}')));
