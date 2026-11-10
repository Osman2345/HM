create or replace function public.prepare_monime_test_payment(
  p_booking_id uuid,
  p_user_id uuid,
  p_reference text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_row public.bookings%rowtype;
  existing_payment public.payments%rowtype;
  booking_vendor_id uuid;
  commission_kind text;
  commission_setting numeric(12, 2);
  commission_amount numeric(12, 2);
  payout_amount numeric(12, 2);
  available_rooms integer;
  recovering_failed_booking boolean;
  settings_currency text;
  payment_reference text;
begin
  select * into booking_row
  from public.bookings
  where id = p_booking_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Booking was not found for this account';
  end if;
  if booking_row.total_price is null or booking_row.total_price <= 0 then
    raise exception 'Booking amount must be greater than zero';
  end if;
  recovering_failed_booking := booking_row.payment_status = 'failed'
    and booking_row.booking_status = 'cancelled';
  if booking_row.payment_method <> 'monime'
    or booking_row.payment_status in ('paid', 'refunded')
    or (
      booking_row.payment_status = 'failed'
      and not recovering_failed_booking
    )
    or booking_row.booking_status in ('completed', 'checked_out', 'no_show')
  then
    raise exception 'Payment is not available for this booking';
  end if;
  if booking_row.created_at <= now() - interval '15 minutes' then
    raise exception 'This room hold has expired. Create a new booking to check current availability.';
  end if;

  perform 1
  from public.hotels
  where id = booking_row.hotel_id
  for update;
  if not found then
    raise exception 'The booking property is no longer available';
  end if;

  if recovering_failed_booking then
    select availability.available_rooms into available_rooms
    from public.get_room_availability(
      booking_row.hotel_id,
      booking_row.check_in,
      booking_row.check_out
    ) availability
    where availability.room_type = booking_row.room_type;
    if not found or available_rooms < booking_row.rooms then
      raise exception 'The rooms from this failed booking are no longer available. Create a new booking to check availability.';
    end if;
  end if;

  select * into existing_payment
  from public.payments
  where booking_id = p_booking_id
    and payment_method = 'monime'
    and status = 'pending'
    and provider_session_id is null
  order by created_at desc
  limit 1
  for update;

  payment_reference := coalesce(existing_payment.provider_reference, p_reference);
  if payment_reference is null or payment_reference = '' then
    raise exception 'A payment reference is required';
  end if;

  update public.bookings
  set is_test = true,
      payment_status = 'pending',
      booking_status = 'pending'
  where id = p_booking_id;

  if existing_payment.id is null then
    insert into public.payments (
      booking_id, amount, status, payment_method, provider_reference
    ) values (
      p_booking_id, booking_row.total_price, 'pending', 'monime', payment_reference
    );
  else
    update public.payments
    set amount = booking_row.total_price
    where id = existing_payment.id;
  end if;

  select h.owner_id into booking_vendor_id
  from public.hotels h
  where h.id = booking_row.hotel_id;
  if booking_vendor_id is null then
    raise exception 'The booking property has no vendor account';
  end if;

  select s.commission_type, s.commission_value, s.currency
  into commission_kind, commission_setting, settings_currency
  from public.platform_settings s
  where s.id = 1;
  commission_kind := coalesce(commission_kind, 'percentage');
  commission_setting := coalesce(commission_setting, 15);
  settings_currency := coalesce(settings_currency, 'SLE');

  if commission_kind = 'fixed_amount' then
    commission_amount := least(booking_row.total_price, greatest(commission_setting, 0));
  else
    commission_amount := least(
      booking_row.total_price,
      greatest(round(booking_row.total_price * commission_setting / 100, 2), 0)
    );
  end if;
  payout_amount := greatest(0, booking_row.total_price - commission_amount);

  insert into public.transactions (
    booking_id, vendor_id, hotel_id, total_amount, commission_amount,
    hotel_payout_amount, status, commission_type, commission_value, currency,
    vendor_payout_status, is_test
  ) values (
    p_booking_id, booking_vendor_id, booking_row.hotel_id, booking_row.total_price,
    commission_amount, payout_amount, 'pending_test', commission_kind,
    commission_setting, settings_currency, 'pending', true
  )
  on conflict (booking_id) do update
  set total_amount = excluded.total_amount,
      commission_amount = excluded.commission_amount,
      hotel_payout_amount = excluded.hotel_payout_amount,
      status = excluded.status,
      commission_type = excluded.commission_type,
      commission_value = excluded.commission_value,
      currency = excluded.currency,
      vendor_payout_status = excluded.vendor_payout_status,
      is_test = excluded.is_test;

  return payment_reference;
end;
$$;

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
  if not booking_row.is_test or booking_row.total_price <= 0 then
    raise exception 'Only TEST bookings can use this release action';
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
      and b.payment_method <> 'pay_at_hotel'
      and b.total_price > 0
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

revoke all on function public.prepare_monime_test_payment(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.prepare_monime_test_payment(uuid, uuid, text)
  to service_role;

revoke all on function public.admin_release_test_booking_funds(uuid)
  from public, anon, authenticated;
revoke all on function public.admin_release_all_pending_test_booking_funds()
  from public, anon, authenticated;
grant execute on function public.admin_release_test_booking_funds(uuid)
  to service_role;
grant execute on function public.admin_release_all_pending_test_booking_funds()
  to service_role;

notify pgrst, 'reload schema';
