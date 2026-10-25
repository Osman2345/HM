alter table public.hotels
  add column if not exists rejection_reason text,
  add column if not exists review_count integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.users
  add column if not exists updated_at timestamptz not null default now();

alter table public.bookings
  add column if not exists updated_at timestamptz not null default now();

alter table public.payouts
  add column if not exists updated_at timestamptz not null default now();

alter table public.notifications
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at
before update on public.users
for each row
execute function public.set_updated_at();

drop trigger if exists hotels_updated_at on public.hotels;
create trigger hotels_updated_at
before update on public.hotels
for each row
execute function public.set_updated_at();

drop trigger if exists bookings_updated_at on public.bookings;
create trigger bookings_updated_at
before update on public.bookings
for each row
execute function public.set_updated_at();

drop trigger if exists payouts_updated_at on public.payouts;
create trigger payouts_updated_at
before update on public.payouts
for each row
execute function public.set_updated_at();

drop trigger if exists notifications_updated_at on public.notifications;
create trigger notifications_updated_at
before update on public.notifications
for each row
execute function public.set_updated_at();

create or replace function public.protect_user_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role = old.role;
    new.disabled = old.disabled;
    new.vendor_status = old.vendor_status;
    new.email = old.email;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_user_fields on public.users;
create trigger protect_user_fields
before update on public.users
for each row
execute function public.protect_user_fields();

create or replace function public.restrict_hotel_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null then
      raise exception 'Authentication required';
    end if;

    if not public.is_admin() then
      if not exists (
        select 1
        from public.users u
        where u.id = auth.uid()
          and u.role = 'vendor'
          and u.vendor_status = 'approved'
      ) then
        raise exception 'Only approved vendors can create hotels';
      end if;

      if coalesce(new.owner_id, auth.uid()) <> auth.uid() then
        raise exception 'The hotel owner must be the current authenticated user';
      end if;

      new.approval_status = 'pending';
      new.featured = false;
      new.rating = 0;
      new.review_count = 0;
      new.rejection_reason = null;
    end if;

    if new.owner_id is null then
      new.owner_id = auth.uid();
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if auth.uid() is not null and not public.is_admin() then
      new.owner_id = old.owner_id;
      new.approval_status = old.approval_status;
      new.featured = old.featured;
      new.rating = old.rating;
      new.commission_rate = old.commission_rate;
      new.rejection_reason = old.rejection_reason;
    end if;

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists restrict_hotel_changes on public.hotels;
create trigger restrict_hotel_changes
before insert or update on public.hotels
for each row
execute function public.restrict_hotel_changes();

create or replace function public.refresh_hotel_review_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hotel_id_value uuid;
  avg_rating numeric(3,1);
  review_total integer;
begin
  hotel_id_value = coalesce(new.hotel_id, old.hotel_id);

  select coalesce(avg(r.rating), 0), count(*)
    into avg_rating, review_total
  from public.reviews r
  where r.hotel_id = hotel_id_value;

  update public.hotels
     set rating = round(avg_rating, 1),
         review_count = review_total,
         updated_at = now()
   where id = hotel_id_value;

  return coalesce(new, old);
end;
$$;

drop trigger if exists refresh_hotel_review_stats on public.reviews;
create trigger refresh_hotel_review_stats
after insert or update of rating or delete on public.reviews
for each row
execute function public.refresh_hotel_review_stats();

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
  v_nights := p_check_out - p_check_in;
  v_total_price := v_room_price * v_nights * p_rooms;

  v_total_capacity := coalesce((
    select sum((elem->>'total_rooms')::int)
    from jsonb_array_elements(v_hotel.rooms) as elem
    where elem->>'type' = p_room_type
  ), 0);

  v_booked_rooms := coalesce((
    select sum(b.rooms)
    from public.bookings b
    where b.hotel_id = p_hotel_id
      and b.booking_status <> 'cancelled'
      and b.check_in < p_check_out
      and b.check_out > p_check_in
      and b.id is not null
  ), 0);

  if v_booked_rooms + p_rooms > v_total_capacity then
    raise exception 'Not enough room availability for the selected dates';
  end if;

  insert into public.bookings (
    user_id,
    hotel_id,
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

create or replace function public.set_booking_status(
  p_booking_id uuid,
  p_status public.booking_status
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_hotel public.hotels%rowtype;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id;

  if not found then
    raise exception 'Booking not found';
  end if;

  select * into v_hotel
  from public.hotels
  where id = v_booking.hotel_id;

  if public.is_admin() then
    null;
  elsif v_user_id = v_booking.user_id then
    if p_status <> 'cancelled' then
      raise exception 'Guests can only cancel a booking';
    end if;
    if v_booking.booking_status not in ('pending', 'confirmed') then
      raise exception 'Guest cancellations are only allowed while pending or confirmed';
    end if;
  elsif v_hotel.owner_id = v_user_id then
    if p_status not in ('confirmed', 'cancelled', 'completed') then
      raise exception 'Hotel owners can only confirm, cancel, or complete bookings';
    end if;
  else
    raise exception 'You do not have permission to change this booking status';
  end if;

  update public.bookings
     set booking_status = p_status,
         updated_at = now()
   where id = p_booking_id
   returning * into v_booking;

  return v_booking;
end;
$$;

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
    select h.*,
           case
             when p_check_in is not null and p_check_out is not null and p_check_in < p_check_out then
               (
                 select coalesce(sum((room->>'total_rooms')::int), 0)
                 from jsonb_array_elements(h.rooms) as room
               ) - coalesce((
                 select sum(b.rooms)
                 from public.bookings b
                 where b.hotel_id = h.id
                   and b.booking_status <> 'cancelled'
                   and b.check_in < p_check_out
                   and b.check_out > p_check_in
               ), 0)
             else
               coalesce((
                 select sum((room->>'total_rooms')::int)
                 from jsonb_array_elements(h.rooms) as room
               ), 0)
           end as available_rooms,
           (
             select coalesce(min((room->>'price_per_night')::numeric(12,2)), 0)
             from jsonb_array_elements(h.rooms) as room
           ) as total_price
    from public.hotels h
    where h.approval_status = 'approved'
      and (p_query = '' or lower(h.name) like '%' || lower(p_query) || '%' or lower(h.description) like '%' || lower(p_query) || '%')
      and (p_city is null or lower(h.city) = lower(p_city) or lower(h.location) like '%' || lower(p_city) || '%')
      and (p_amenities is null or p_amenities = '{}'::text[] or h.amenities && p_amenities)
      and h.rating >= p_min_rating
      and (p_max_price is null or (
            select coalesce(min((room->>'price_per_night')::numeric(12,2)), 0)
            from jsonb_array_elements(h.rooms) as room
          ) <= p_max_price)
  )
  select b.id,
         b.owner_id,
         b.name,
         b.description,
         b.location,
         b.latitude,
         b.longitude,
         b.city,
         b.country,
         b.rating,
         b.review_count,
         b.amenities,
         b.featured,
         b.approval_status,
         b.cover_image,
         b.policies,
         b.check_in_time,
         b.check_out_time,
         b.images,
         b.rooms,
         0::numeric as distance_km,
         b.total_price,
         b.available_rooms
  from base b
  order by
    case when p_sort = 'featured' then b.featured end desc,
    b.rating desc,
    b.created_at desc
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
  select h.id,
         h.name,
         h.city,
         h.latitude,
         h.longitude,
         (
           6371 * acos(
             cos(radians(p_lat)) * cos(radians(h.latitude)) *
             cos(radians(h.longitude) - radians(p_lng)) +
             sin(radians(p_lat)) * sin(radians(h.latitude))
           )
         )::numeric(10,2) as distance_km,
         h.rating,
         h.cover_image,
         h.approval_status
  from public.hotels h
  where h.approval_status = 'approved'
    and (
      6371 * acos(
        cos(radians(p_lat)) * cos(radians(h.latitude)) *
        cos(radians(h.longitude) - radians(p_lng)) +
        sin(radians(p_lat)) * sin(radians(h.latitude))
      )
    ) <= p_radius_km
  order by distance_km asc
  limit greatest(coalesce(p_limit, 10), 1);
end;
$$;

create or replace function public.restrict_booking_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Bookings must be created through the create_booking security-definer RPC';
end;
$$;

drop trigger if exists prevent_client_booking_insert on public.bookings;
create trigger prevent_client_booking_insert
before insert on public.bookings
for each row
execute function public.restrict_booking_insert();

drop trigger if exists prevent_client_booking_update on public.bookings;
create trigger prevent_client_booking_update
before update on public.bookings
for each row
execute function public.restrict_booking_insert();

create or replace function public.notify_booking_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hotel_owner uuid;
  guest_user uuid;
begin
  if tg_op = 'DELETE' then
    hotel_owner := (select owner_id from public.hotels where id = old.hotel_id);
    guest_user := old.user_id;
  else
    hotel_owner := (select owner_id from public.hotels where id = new.hotel_id);
    guest_user := new.user_id;
  end if;

  if hotel_owner = guest_user then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' and hotel_owner is not null then
    insert into public.notifications (user_id, title, message)
    values (hotel_owner, 'New booking request', 'A guest made a booking request for your hotel.');
  elsif tg_op = 'UPDATE' and old.booking_status is distinct from new.booking_status then
    if new.user_id <> hotel_owner then
      insert into public.notifications (user_id, title, message)
      values (
        new.user_id,
        case new.booking_status
          when 'confirmed' then 'Booking confirmed'
          when 'cancelled' then 'Booking cancelled'
          when 'completed' then 'Stay completed'
          else 'Booking status updated'
        end,
        case new.booking_status
          when 'confirmed' then 'Your booking was confirmed by the hotel.'
          when 'cancelled' then 'Your booking was cancelled.'
          when 'completed' then 'Your stay was marked complete.'
          else 'Your booking status changed.'
        end
      );
    end if;
  elsif tg_op = 'DELETE' and hotel_owner is not null then
    insert into public.notifications (user_id, title, message)
    values (hotel_owner, 'Booking deleted', 'A guest cancelled or removed a booking from the system.');
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists booking_notification_events on public.bookings;
create trigger booking_notification_events
after insert or update of booking_status or delete on public.bookings
for each row
execute function public.notify_booking_events();

create or replace function public.restrict_webhook_logs_access()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Only admins can access webhook logs';
  end if;
  return new;
end;
$$;

drop policy if exists "webhook_logs_admin_only" on public.webhook_logs;
create policy "webhook_logs_admin_only" on public.webhook_logs
for select using (public.is_admin());

create policy "webhook_logs_no_client_write" on public.webhook_logs
for insert with check (false);

create policy "webhook_logs_no_client_update_delete" on public.webhook_logs
for update using (false)
with check (false);

drop policy if exists "payouts_admin_owner_read" on public.payouts;
create policy "payouts_admin_owner_read" on public.payouts
for select using (
  public.is_admin() or exists (
    select 1
    from public.hotels h
    where h.id = hotel_id and h.owner_id = auth.uid()
  )
);

create policy "payouts_no_client_write" on public.payouts
for insert with check (false);
create policy "payouts_no_client_update_delete" on public.payouts
for update using (false)
with check (false);

drop policy if exists "hotel_images_public_read" on storage.objects;

drop policy if exists "hotel_images_owner_or_admin_write" on storage.objects;
create policy "hotel_images_owner_or_admin_write" on storage.objects
for all using (
  bucket_id = 'hotel-images'
  and (
    public.is_admin()
    or (
      auth.uid()::text = (storage.foldername(name))[1]
      and exists (
        select 1
        from public.users u
        where u.id = auth.uid()
          and u.role = 'vendor'
          and u.vendor_status = 'approved'
      )
    )
  )
)
with check (
  bucket_id = 'hotel-images'
  and (
    public.is_admin()
    or (
      auth.uid()::text = (storage.foldername(name))[1]
      and exists (
        select 1
        from public.users u
        where u.id = auth.uid()
          and u.role = 'vendor'
          and u.vendor_status = 'approved'
      )
    )
  )
);

create policy "profile_images_own_write" on storage.objects
for all using (
  bucket_id = 'profile-images' and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'profile-images' and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "vendor_documents_own_or_admin" on storage.objects
for all using (
  bucket_id = 'vendor-documents' and (
    auth.uid()::text = (storage.foldername(name))[1] or public.is_admin()
  )
)
with check (
  bucket_id = 'vendor-documents' and (
    auth.uid()::text = (storage.foldername(name))[1] or public.is_admin()
  )
);

create policy "hotel_images_read_public" on storage.objects
for select using (bucket_id = 'hotel-images');
create policy "profile_images_read_public" on storage.objects
for select using (bucket_id = 'profile-images');

insert into storage.buckets (id, name, public, avif_autodetection) values ('hotel-images', 'hotel-images', true, true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, avif_autodetection) values ('profile-images', 'profile-images', true, true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, avif_autodetection) values ('vendor-documents', 'vendor-documents', false, true)
on conflict (id) do nothing;

alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.bookings;

create index if not exists hotels_approval_status_idx on public.hotels(approval_status);
create index if not exists hotels_owner_idx on public.hotels(owner_id);
create index if not exists bookings_hotel_checkin_checkout_idx on public.bookings(hotel_id, check_in, check_out);
create index if not exists notifications_user_read_idx on public.notifications(user_id, read);
create index if not exists reviews_hotel_idx on public.reviews(hotel_id);
