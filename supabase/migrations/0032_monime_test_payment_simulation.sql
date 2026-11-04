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
  set total_price = 1,
      is_test = true,
      payment_status = 'pending',
      booking_status = 'pending'
  where id = p_booking_id;

  if existing_payment.id is null then
    insert into public.payments (
      booking_id, amount, status, payment_method, provider_reference
    ) values (
      p_booking_id, 1, 'pending', 'monime', payment_reference
    );
  else
    update public.payments
    set amount = 1
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
    commission_amount := least(1, commission_setting);
  else
    commission_amount := round(commission_setting / 100, 2);
  end if;
  payout_amount := greatest(0, 1 - commission_amount);

  insert into public.transactions (
    booking_id, vendor_id, hotel_id, total_amount, commission_amount,
    hotel_payout_amount, status, commission_type, commission_value, currency,
    vendor_payout_status
  ) values (
    p_booking_id, booking_vendor_id, booking_row.hotel_id, 1,
    commission_amount, payout_amount, 'pending_test', commission_kind,
    commission_setting, settings_currency, 'pending'
  )
  on conflict (booking_id) do nothing;

  return payment_reference;
end;
$$;

revoke all on function public.prepare_monime_test_payment(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.prepare_monime_test_payment(uuid, uuid, text)
  to service_role;

notify pgrst, 'reload schema';
