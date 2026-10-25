alter table public.bookings
  add column if not exists room_type text;

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
  v_nights integer;
  v_total_price numeric(12,2);
  v_total_capacity integer;
  v_booked_rooms integer;
  v_booking public.bookings%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_check_out <= p_check_in then
    raise exception 'Check-out must be after check-in';
  end if;

  if p_guests <= 0 or p_rooms <= 0 then
    raise exception 'Guests and rooms must be positive values';
  end if;

  if p_check_in < current_date then
    raise exception 'Booking dates cannot be in the past';
  end if;

  select * into v_hotel
  from public.hotels
  where id = p_hotel_id
  for update;

  if not found then
    raise exception 'Hotel not found';
  end if;

  if v_hotel.approval_status <> 'approved' then
    raise exception 'Hotel is not available for booking';
  end if;

  select room into v_room
  from jsonb_array_elements(v_hotel.rooms) as room
  where room->>'type' = p_room_type
  limit 1;

  if v_room is null then
    raise exception 'Room type not found for this hotel';
  end if;

  v_room_price := (v_room->>'price_per_night')::numeric(12,2);
  v_room_capacity := coalesce((v_room->>'capacity_guests')::integer, 1);
  if p_guests > v_room_capacity * p_rooms then
    raise exception 'Guest count exceeds the capacity of the selected rooms';
  end if;

  v_nights := p_check_out - p_check_in;
  v_total_price := v_room_price * v_nights * p_rooms;

  v_total_capacity := coalesce((
    select sum((elem->>'total_rooms')::integer)
    from jsonb_array_elements(v_hotel.rooms) as elem
    where elem->>'type' = p_room_type
  ), 0);

  v_booked_rooms := coalesce((
    select sum(b.rooms)
    from public.bookings b
    where b.hotel_id = p_hotel_id
      and b.room_type = p_room_type
      and b.booking_status <> 'cancelled'
      and b.check_in < p_check_out
      and b.check_out > p_check_in
  ), 0);

  if v_booked_rooms + p_rooms > v_total_capacity then
    raise exception 'Not enough rooms of this type are available for the selected dates';
  end if;

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
    v_total_price,
    'pending',
    'pending'
  )
  returning * into v_booking;

  return v_booking;
end;
$$;
