create or replace function public.vendor_has_commission_booking_hold(p_vendor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*) >= 5
  from public.bookings as booking
  join public.hotels as hotel on hotel.id = booking.hotel_id
  where hotel.owner_id = p_vendor_id
    and booking.payment_method = 'pay_at_hotel'
    and booking.commission_status = 'unpaid'
    and booking.commission > 0;
$$;

revoke all on function public.vendor_has_commission_booking_hold(uuid)
  from public, anon, authenticated;
grant execute on function public.vendor_has_commission_booking_hold(uuid)
  to anon, authenticated;

create index if not exists bookings_unpaid_pay_at_hotel_commission_idx
  on public.bookings (hotel_id)
  where payment_method = 'pay_at_hotel'
    and commission_status = 'unpaid'
    and commission > 0;

update public.vendor_wallets as wallet
set can_receive_bookings = not public.vendor_has_commission_booking_hold(wallet.vendor_id),
    updated_at = now();

create or replace function public.prepare_booking_commission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_vendor_id uuid;
  wallet_row public.vendor_wallets%rowtype;
begin
  if tg_op = 'INSERT' then
    select hotel.owner_id into booking_vendor_id
    from public.hotels as hotel
    where hotel.id = new.hotel_id;

    if booking_vendor_id is null then
      raise exception 'The booking property has no vendor account';
    end if;

    insert into public.vendor_wallets (vendor_id)
    values (booking_vendor_id)
    on conflict (vendor_id) do nothing;

    select * into wallet_row
    from public.vendor_wallets
    where vendor_id = booking_vendor_id
    for update;

    if public.vendor_has_commission_booking_hold(booking_vendor_id) then
      raise exception 'Account on hold: Pay the commission owed from at least five pay-at-hotel bookings before accepting new bookings';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.commission := round(greatest(coalesce(new.total_price, 0), 0) * 0.15, 2);
  elsif new.total_price is distinct from old.total_price then
    new.commission := round(greatest(coalesce(new.total_price, 0), 0) * 0.15, 2);
  end if;

  if new.payment_method = 'pay_at_hotel' then
    new.payment_type := 'pay_at_hotel';
    if tg_op = 'INSERT' then
      new.payment_status := 'reserved_not_paid';
      new.commission_status := case
        when new.commission = 0 then 'not_applicable'::public.commission_status
        else 'unpaid'::public.commission_status
      end;
      new.is_test := true;
    end if;
  elsif new.payment_status = 'paid' then
    new.commission_status := case
      when new.commission = 0 then 'not_applicable'::public.commission_status
      else 'paid'::public.commission_status
    end;
  elsif tg_op = 'INSERT' then
    new.commission_status := case
      when new.commission = 0 then 'not_applicable'::public.commission_status
      else 'unpaid'::public.commission_status
    end;
  end if;

  return new;
end;
$$;

create or replace function public.track_pay_at_hotel_commission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_vendor_id uuid;
  unpaid_commission_count integer;
begin
  if new.payment_method <> 'pay_at_hotel' or new.commission <= 0 then
    return new;
  end if;

  select hotel.owner_id into booking_vendor_id
  from public.hotels as hotel
  where hotel.id = new.hotel_id;

  if booking_vendor_id is null then
    raise exception 'The booking property has no vendor account';
  end if;

  insert into public.vendor_wallets (vendor_id)
  values (booking_vendor_id)
  on conflict (vendor_id) do nothing;

  select count(*)::integer into unpaid_commission_count
  from public.bookings as booking
  join public.hotels as hotel on hotel.id = booking.hotel_id
  where hotel.owner_id = booking_vendor_id
    and booking.payment_method = 'pay_at_hotel'
    and booking.commission_status = 'unpaid'
    and booking.commission > 0;

  update public.vendor_wallets
  set commission_due = commission_due + new.commission,
      can_receive_bookings = unpaid_commission_count < 5,
      updated_at = now()
  where vendor_id = booking_vendor_id;

  return new;
end;
$$;

drop policy if exists "hotels_public_read" on public.hotels;
create policy "hotels_public_read" on public.hotels
for select using (
  owner_id = auth.uid()
  or public.is_admin()
  or (
    approval_status = 'approved'
    and not public.vendor_has_commission_booking_hold(owner_id)
  )
);

create or replace function public.search_hotels(
  p_query text default '',
  p_city text default null,
  p_min_price numeric default 0,
  p_max_price numeric default null,
  p_amenities text[] default null,
  p_min_rating numeric default 0,
  p_check_in date default null,
  p_check_out date default null,
  p_guests integer default 1,
  p_sort text default 'featured',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  owner_id uuid,
  name text,
  description text,
  location text,
  latitude double precision,
  longitude double precision,
  city text,
  country text,
  rating numeric,
  review_count integer,
  amenities text[],
  featured boolean,
  approval_status text,
  cover_image text,
  policies text,
  check_in_time text,
  check_out_time text,
  images text[],
  rooms jsonb,
  distance_km numeric,
  total_price numeric,
  available_rooms integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city text := lower(coalesce(p_city, ''));
  v_limit integer := greatest(coalesce(p_limit, 20), 1);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  return query
  with base as (
    select hotel.*,
           case
             when p_check_in is not null and p_check_out is not null and p_check_in < p_check_out then
               (
                 select coalesce(sum((room->>'total_rooms')::int), 0)
                 from jsonb_array_elements(hotel.rooms) as room
               ) - coalesce((
                 select sum(booking.rooms)
                 from public.bookings as booking
                 where booking.hotel_id = hotel.id
                   and booking.booking_status <> 'cancelled'
                   and booking.check_in < p_check_out
                   and booking.check_out > p_check_in
               ), 0)
             else
               coalesce((
                 select sum((room->>'total_rooms')::int)
                 from jsonb_array_elements(hotel.rooms) as room
               ), 0)
           end as room_count_available,
           (
             select coalesce(min((room->>'price_per_night')::numeric(12,2)), 0)
             from jsonb_array_elements(hotel.rooms) as room
           ) as listing_total_price
    from public.hotels as hotel
    where hotel.approval_status = 'approved'
      and not public.vendor_has_commission_booking_hold(hotel.owner_id)
      and (p_query = '' or lower(hotel.name) like '%' || lower(p_query) || '%' or lower(hotel.description) like '%' || lower(p_query) || '%')
      and (p_city is null or lower(hotel.city) = lower(p_city) or lower(hotel.location) like '%' || lower(p_city) || '%')
      and (p_amenities is null or p_amenities = '{}'::text[] or hotel.amenities && p_amenities)
      and hotel.rating >= p_min_rating
      and (p_max_price is null or (
            select coalesce(min((room->>'price_per_night')::numeric(12,2)), 0)
            from jsonb_array_elements(hotel.rooms) as room
          ) <= p_max_price)
  )
  select base.id,
         base.owner_id,
         base.name,
         base.description,
         base.location,
         base.latitude,
         base.longitude,
         base.city,
         base.country,
         base.rating,
         base.review_count,
         base.amenities,
         base.featured,
         base.approval_status,
         base.cover_image,
         base.policies,
         base.check_in_time,
         base.check_out_time,
         base.images,
         base.rooms,
         0::numeric as distance_km,
         base.listing_total_price,
         base.room_count_available
  from base
  order by
    case when p_sort = 'featured' then base.featured end desc,
    base.rating desc,
    base.created_at desc
  limit v_limit offset v_offset;
end;
$$;

create or replace function public.nearby_hotels(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 20,
  p_limit integer default 10
)
returns table (
  id uuid,
  name text,
  city text,
  latitude double precision,
  longitude double precision,
  distance_km numeric,
  rating numeric,
  cover_image text,
  approval_status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select hotel.id,
         hotel.name,
         hotel.city,
         hotel.latitude,
         hotel.longitude,
         (
           6371 * acos(
             cos(radians(p_lat)) * cos(radians(hotel.latitude)) *
             cos(radians(hotel.longitude) - radians(p_lng)) +
             sin(radians(p_lat)) * sin(radians(hotel.latitude))
           )
         )::numeric(10,2) as distance_km,
         hotel.rating,
         hotel.cover_image,
         hotel.approval_status
  from public.hotels as hotel
  where hotel.approval_status = 'approved'
    and not public.vendor_has_commission_booking_hold(hotel.owner_id)
    and (
      6371 * acos(
        cos(radians(p_lat)) * cos(radians(hotel.latitude)) *
        cos(radians(hotel.longitude) - radians(p_lng)) +
        sin(radians(p_lat)) * sin(radians(hotel.latitude))
      )
    ) <= p_radius_km
  order by distance_km asc
  limit greatest(coalesce(p_limit, 10), 1);
end;
$$;

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
    and not public.vendor_has_commission_booking_hold(hotel.owner_id)
  order by saved.created_at desc;
end;
$$;

notify pgrst, 'reload schema';
