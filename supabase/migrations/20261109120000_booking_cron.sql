-- pg_cron schedules for the booking jobs (docs/specs/phase-4-booking-payments.md decision 4).
-- Jobs only clean up: every booking function expires its own lapsed hold first, so nothing depends
-- on them running on time. cron.schedule() with a job name replaces an existing job of that name.
-- Times are UTC: 19:15 and 19:30 UTC are 02:15 and 02:30 in Vietnam.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed; booking jobs are not scheduled';
    return;
  end if;
  perform cron.schedule('booking-expire-holds', '*/5 * * * *', 'select public.expire_holds()');
  perform cron.schedule('booking-complete', '15 19 * * *', 'select public.complete_bookings()');
  perform cron.schedule('booking-seat-invariant', '30 19 * * *', 'select public.check_seat_invariant()');
end;
$$;
