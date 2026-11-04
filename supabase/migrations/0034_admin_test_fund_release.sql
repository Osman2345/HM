alter table public.transactions
  add column if not exists type text not null default 'BOOKING_EARNING',
  add column if not exists amount numeric(12, 2),
  add column if not exists note text,
  add column if not exists is_test boolean not null default false,
  add column if not exists released_at timestamptz;

update public.transactions t
set is_test = b.is_test
from public.bookings b
where b.id = t.booking_id
  and b.is_test is distinct from t.is_test;

create or replace function public.admin_release_test_booking_funds(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_row public.bookings%rowtype;
  transaction_row public.transactions%rowtype;
  settings_row public.platform_settings%rowtype;
  v_commission_amount numeric(12, 2);
  v_vendor_amount numeric(12, 2);
  vendor_user public.users%rowtype;
  release_note text;
begin
  select * into booking_row
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking was not found';
  end if;
  if booking_row.booking_status = 'completed' then
    raise exception 'Already released';
  end if;
  if booking_row.booking_status in ('cancelled', 'no_show') then
    raise exception 'Cancelled or no-show bookings cannot be released';
  end if;
  if not booking_row.is_test or booking_row.total_price <> 1 then
    raise exception 'Only Le 1 TEST bookings can use this release action';
  end if;
  if booking_row.payment_status <> 'paid' then
    raise exception 'Complete the TEST payment with PIN 1234 before releasing funds';
  end if;

  select * into transaction_row
  from public.transactions
  where booking_id = booking_row.id
    and vendor_payout_status = 'pending'
  for update;

  if not found then
    raise exception 'No pending vendor earnings were found for this booking';
  end if;
  if transaction_row.vendor_id is null then
    raise exception 'The booking has no vendor to receive this release';
  end if;

  select * into settings_row
  from public.platform_settings
  where id = 1;

  if coalesce(settings_row.commission_type, 'percentage') = 'fixed_amount' then
    v_commission_amount := least(booking_row.total_price, coalesce(settings_row.commission_value, 15));
  else
    v_commission_amount := round(
      booking_row.total_price * coalesce(settings_row.commission_value, 15) / 100,
      2
    );
  end if;
  v_commission_amount := greatest(0, least(booking_row.total_price, v_commission_amount));
  v_vendor_amount := round(booking_row.total_price - v_commission_amount, 2);
  release_note := 'Admin released Le '
    || to_char(v_vendor_amount, 'FM999999999999990.00')
    || ' TEST';

  update public.transactions
  set total_amount = booking_row.total_price,
      amount = v_vendor_amount,
      commission_amount = v_commission_amount,
      hotel_payout_amount = v_vendor_amount,
      status = 'released_test',
      vendor_payout_status = 'eligible',
      type = 'PAYOUT_RELEASE',
      note = release_note,
      is_test = true,
      released_at = now()
  where id = transaction_row.id;

  update public.bookings
  set booking_status = 'completed',
      is_test = true,
      updated_at = now()
  where id = booking_row.id;

  select * into vendor_user
  from public.users
  where id = transaction_row.vendor_id;

  return jsonb_build_object(
    'bookingId', booking_row.id,
    'vendorId', transaction_row.vendor_id,
    'vendorName', vendor_user.fullname,
    'vendorPhone', vendor_user.phone,
    'amount', v_vendor_amount,
    'isTest', true,
    'note', release_note,
    'releasedAt', now()
  );
end;
$$;

create or replace function public.admin_release_all_pending_test_booking_funds()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_booking record;
  releases jsonb := '[]'::jsonb;
begin
  for pending_booking in
    select b.id
    from public.bookings b
    join public.transactions t on t.booking_id = b.id
    where b.is_test = true
      and b.total_price = 1
      and b.payment_status = 'paid'
      and b.booking_status not in ('completed', 'cancelled', 'no_show')
      and t.vendor_payout_status = 'pending'
    order by b.created_at
  loop
    releases := releases || jsonb_build_array(
      public.admin_release_test_booking_funds(pending_booking.id)
    );
  end loop;

  return releases;
end;
$$;

revoke all on function public.admin_release_test_booking_funds(uuid)
  from public, anon, authenticated;
revoke all on function public.admin_release_all_pending_test_booking_funds()
  from public, anon, authenticated;
grant execute on function public.admin_release_test_booking_funds(uuid)
  to service_role;
grant execute on function public.admin_release_all_pending_test_booking_funds()
  to service_role;

notify pgrst, 'reload schema';
