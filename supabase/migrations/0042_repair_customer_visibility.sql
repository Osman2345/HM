drop policy if exists "hotels_customer_visibility_guard" on public.hotels;
create policy "hotels_customer_visibility_guard" on public.hotels
as restrictive
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
stable
security definer
set search_path = public
as $$
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
  limit greatest(coalesce(p_limit, 20), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

notify pgrst, 'reload schema';
