-- Sales roles may add a note to an inquiry only when they can see that inquiry (assigned to
-- them or unassigned), matching the read policy (PR #2 review follow-up). Admin is unchanged.
drop policy "internal_notes: staff insert own" on public.internal_notes;

create policy "internal_notes: admin insert own" on public.internal_notes
  for insert to authenticated
  with check (
    (select public.can_act_as('{admin}'))
    and author_id = (select auth.uid())
  );

create policy "internal_notes: sales insert own" on public.internal_notes
  for insert to authenticated
  with check (
    (select public.can_act_as('{sales,sales_manager}'))
    and author_id = (select auth.uid())
    and (
      inquiry_id is null
      or exists (select 1 from public.inquiries i where i.id = inquiry_id)
    )
  );
