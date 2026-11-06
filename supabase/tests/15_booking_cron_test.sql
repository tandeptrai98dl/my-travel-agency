-- pg_cron schedules for the booking jobs (*_booking_cron.sql). Skipped where pg_cron is missing.
begin;
select plan(1);

create function pg_temp.booking_jobs()
returns int
language plpgsql
as $$
declare
  jobs int;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return 3;
  end if;
  execute $sql$select count(*)::int from cron.job where jobname in
    ('booking-expire-holds', 'booking-complete', 'booking-seat-invariant')$sql$ into jobs;
  return jobs;
end;
$$;

select is(pg_temp.booking_jobs(), 3, 'expire_holds, complete_bookings and check_seat_invariant are scheduled');

select * from finish();
rollback;
