create or replace function public.cancel_guest_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
begin
  if v_user_id is null then
    raise exception 'Sign in to cancel this booking';
  end if;

  if not public.is_active_user() then
    raise exception 'This account is not allowed to cancel bookings';
  end if;

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found or v_booking.user_id is distinct from v_user_id then
    raise exception 'Booking not found for this account';
  end if;

  if v_booking.payment_status = 'paid' then
    raise exception 'This booking has already been paid. Contact support to cancel it and request a refund.';
  end if;

  if v_booking.booking_status not in ('pending', 'confirmed') then
    raise exception 'Only pending or confirmed bookings can be cancelled';
  end if;

  update public.bookings
  set booking_status = 'cancelled',
      updated_at = now()
  where id = p_booking_id
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke all on function public.cancel_guest_booking(uuid) from public, anon;
grant execute on function public.cancel_guest_booking(uuid) to authenticated;

create or replace function public.get_my_saved_hotels()
returns table (
  favorite_id uuid,
  hotel_id uuid,
  name text,
  city text,
  country text,
  location text,
  rating numeric,
  cover_image text,
  images text[],
  rooms jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Sign in to view saved hotels';
  end if;

  if not public.is_active_user() then
    raise exception 'This account is not allowed to view saved hotels';
  end if;

  return query
  select
    saved.id,
    hotel.id,
    hotel.name,
    hotel.city,
    hotel.country,
    hotel.location,
    hotel.rating,
    hotel.cover_image,
    hotel.images,
    hotel.rooms
  from public.favorites as saved
  join public.hotels as hotel on hotel.id = saved.hotel_id
  where saved.user_id = v_user_id
  order by saved.created_at desc;
end;
$$;

revoke all on function public.get_my_saved_hotels() from public, anon;
grant execute on function public.get_my_saved_hotels() to authenticated;

notify pgrst, 'reload schema';
