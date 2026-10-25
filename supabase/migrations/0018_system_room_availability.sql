create or replace function public.get_room_availability(
  p_hotel_id uuid,
  p_check_in date,
  p_check_out date
)
returns table (
  room_type text,
  total_rooms integer,
  reserved_rooms integer,
  available_rooms integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_check_in is null or p_check_out is null or p_check_out <= p_check_in then
    raise exception 'Check-out must be after check-in';
  end if;

  return query
  with room_types as (
    select
      room_item.value->>'type' as room_type,
      sum(greatest(coalesce((room_item.value->>'total_rooms')::integer, 0), 0))::integer as total_rooms
    from public.hotels as hotel
    cross join lateral jsonb_array_elements(coalesce(hotel.rooms, '[]'::jsonb)) as room_item(value)
    where hotel.id = p_hotel_id
      and hotel.approval_status = 'approved'
    group by room_item.value->>'type'
  )
  select
    room_types.room_type,
    room_types.total_rooms,
    coalesce(reservations.reserved_rooms, 0),
    greatest(
      room_types.total_rooms
        - coalesce(reservations.reserved_rooms, 0),
      0
    )
  from room_types
  left join lateral (
    select sum(booking.rooms)::integer as reserved_rooms
    from public.bookings as booking
    where booking.hotel_id = p_hotel_id
      and booking.room_type = room_types.room_type
      and booking.booking_status <> 'cancelled'
      and booking.check_in < p_check_out
      and booking.check_out > p_check_in
      and (
        booking.payment_status = 'paid'
        or (
          booking.payment_status = 'pending'
          and booking.created_at > now() - interval '15 minutes'
        )
      )
  ) as reservations on true;
end;
$$;

grant execute on function public.get_room_availability(uuid, date, date)
  to anon, authenticated;

create or replace function public.create_booking(
  p_hotel_id uuid,
  p_room_type text,
  p_check_in date,
  p_check_out date,
  p_guests integer,
  p_rooms integer
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_hotel public.hotels%rowtype;
  v_room jsonb;
  v_room_price numeric(12,2);
  v_room_capacity integer;
  v_total_capacity integer;
  v_reserved_rooms integer;
  v_nights integer;
  v_booking public.bookings%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_check_in is null or p_check_out is null or p_check_out <= p_check_in then
    raise exception 'Check-out must be after check-in';
  end if;
  if p_guests is null or p_rooms is null or p_guests <= 0 or p_rooms <= 0 then
    raise exception 'Guests and rooms must be positive values';
  end if;
  if p_check_in < current_date then
    raise exception 'Booking dates cannot be in the past';
  end if;

  select * into v_hotel
  from public.hotels
  where id = p_hotel_id
  for update;

  if not found or v_hotel.approval_status <> 'approved' then
    raise exception 'Hotel is not available for booking';
  end if;

  select room_item.value
  into v_room
  from jsonb_array_elements(coalesce(v_hotel.rooms, '[]'::jsonb)) as room_item(value)
  where room_item.value->>'type' = p_room_type
  limit 1;

  if v_room is null then
    raise exception 'Room type not found for this hotel';
  end if;

  v_room_price := coalesce((v_room->>'price_per_night')::numeric(12,2), 0);
  v_room_capacity := greatest(coalesce((v_room->>'capacity_guests')::integer, 1), 1);
  select coalesce(sum(greatest(coalesce((room_item.value->>'total_rooms')::integer, 0), 0)), 0)::integer
  into v_total_capacity
  from jsonb_array_elements(coalesce(v_hotel.rooms, '[]'::jsonb)) as room_item(value)
  where room_item.value->>'type' = p_room_type;

  if v_room_price <= 0 then
    raise exception 'This room type cannot be booked at the moment';
  end if;
  if p_guests > v_room_capacity * p_rooms then
    raise exception 'Guest count exceeds the capacity of the selected rooms';
  end if;

  select coalesce(sum(booking.rooms), 0)::integer
  into v_reserved_rooms
  from public.bookings as booking
  where booking.hotel_id = p_hotel_id
    and booking.room_type = p_room_type
    and booking.booking_status <> 'cancelled'
    and booking.check_in < p_check_out
    and booking.check_out > p_check_in
    and (
      booking.payment_status = 'paid'
      or (
        booking.payment_status = 'pending'
        and booking.created_at > now() - interval '15 minutes'
      )
    );

  if v_reserved_rooms + p_rooms > v_total_capacity then
    raise exception 'Not enough rooms of this type are available for the selected dates';
  end if;

  v_nights := p_check_out - p_check_in;

  insert into public.bookings (
    user_id,
    hotel_id,
    room_type,
    check_in,
    check_out,
    guests,
    rooms,
    total_price,
    payment_status,
    booking_status
  )
  values (
    v_user_id,
    p_hotel_id,
    p_room_type,
    p_check_in,
    p_check_out,
    p_guests,
    p_rooms,
    v_room_price * v_nights * p_rooms,
    'pending',
    'pending'
  )
  returning * into v_booking;

  return v_booking;
end;
$$;

notify pgrst, 'reload schema';
