-- Restore check (README.md "Runbooks" > "Restore from backup", Phase 6 decision 8).
--
-- Read-only: one booking, its payments, timeline, audit trail and seat count, and the newest write
-- in the database (for the RPO). Nothing is changed: the whole script runs in a read-only
-- transaction that is rolled back.
--
--   psql "<restored project's connection string>" -v code=PTA-2611-0042 -f scripts/restore-check.sql
--
-- In the Supabase SQL editor, paste the script and replace each :'code' with the booking code in
-- single quotes ('PTA-2611-0042'). Every row should say ok = true; "newest write" is information
-- only: in a restored copy pg_cron jobs write as soon as it starts, so the RPO is measured on the
-- booking's own "updated" time (row 1), as the runbook explains.
-- The result holds a booking code, statuses, amounts and times only: no names or contact details.

begin transaction isolation level repeatable read read only;

with b as (
  select * from public.bookings where code = :'code'
),
p as (
  select p.* from public.payments p join b on p.booking_id = b.id
),
ev as (
  select e.* from public.booking_events e join b on e.booking_id = b.id
),
au as (
  select l.*
    from public.audit_logs l
   where l.entity_id in (select id from b union all select id from p)
      or l.changes ->> 'booking' = :'code'
),
seats as (
  select d.seats_reserved,
         (select coalesce(sum(x.adults + x.children), 0)
            from public.bookings x
           where x.departure_id = d.id
             and x.status in ('pending_payment', 'confirmed', 'completed')) as counted
    from public.departures d join b on d.id = b.departure_id
),
newest as (
  select greatest(
           (select max(updated_at) from public.bookings),
           (select max(created_at) from public.booking_events),
           (select max(updated_at) from public.payments),
           (select max(created_at) from public.audit_logs),
           (select max(created_at) from public.email_logs)
         ) as at
)
select 1 as n, 'booking' as "check", count(*) = 1 as ok,
       coalesce(max(code || ': ' || status || ' / ' || payment_state || ', paid ' || amount_paid || ' of ' || total
                    || ', updated ' || to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
                'not found') as detail
  from b
union all
select 2, 'payments', count(*) > 0,
       count(*) || ' row(s): ' || coalesce(string_agg(kind || ' ' || provider || ' ' || status || ' ' || amount, ', ' order by created_at), 'none')
  from p
union all
select 3, 'amount_paid = succeeded payments - refunds',
       coalesce((select amount_paid from b), -1)
         = coalesce(sum(amount) filter (where status = 'succeeded' and kind <> 'refund'), 0)
         - coalesce(sum(amount) filter (where status = 'succeeded' and kind = 'refund'), 0),
       'booking ' || coalesce((select amount_paid::text from b), '-') || ', payments '
         || (coalesce(sum(amount) filter (where status = 'succeeded' and kind <> 'refund'), 0)
             - coalesce(sum(amount) filter (where status = 'succeeded' and kind = 'refund'), 0))
  from p
union all
select 4, 'booking events', count(*) > 0,
       count(*) || ' event(s), last: ' || coalesce((select type from ev order by created_at desc, id desc limit 1), 'none')
  from ev
union all
select 5, 'audit trail', count(*) > 0,
       count(*) || ' row(s): ' || coalesce(string_agg(action, ', ' order by created_at), 'none')
  from au
union all
select 6, 'departure seats = held and confirmed travellers', coalesce(bool_and(seats_reserved = counted), true),
       coalesce(string_agg('seats_reserved ' || seats_reserved || ', counted ' || counted, ''), 'no departure')
  from seats
union all
select 7, 'newest write (information; a restored copy''s pg_cron writes at once, so measure the RPO on row 1)', true,
       coalesce(to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'none')
  from newest
order by n;

rollback;
