-- Phase 6 PR 6A (docs/specs/phase-6-hardening-launch.md decision 1): gaps the role-matrix test
-- (supabase/tests/50_role_matrix_test.sql) found between RLS and ARCHITECTURE.md "Authorization".
--
-- Bookings: the matrix gives booking edits (contact details, requests, owner, invoice details) to
-- sales, sales managers and admins; operators "edit travellers, read" and change status only
-- through staff_cancel_booking(). The Phase 0 update policy also let operators write those columns
-- through the API, although the app's `bookings.edit` permission never did.
drop policy "bookings: staff update" on public.bookings;

create policy "bookings: staff update" on public.bookings
  for update to authenticated
  using ((select public.can_act_as('{sales,sales_manager,admin}')))
  with check ((select public.can_act_as('{sales,sales_manager,admin}')));
