create extension if not exists "pgcrypto";

create type public.user_role as enum ('user', 'vendor', 'admin');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');
create type public.booking_status as enum ('pending', 'confirmed', 'cancelled', 'completed');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  fullname text not null,
  email text not null unique,
  phone text,
  profile_image text,
  role public.user_role not null default 'user',
  location text,
  preferences jsonb not null default '{}'::jsonb,
  disabled boolean not null default false,
  vendor_status text not null default 'approved',
  business_name text,
  business_description text,
  business_logo text,
  business_document_url text,
  created_at timestamptz not null default now()
);

create table public.hotels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.users(id) on delete set null,
  name text not null,
  description text not null,
  price_per_night numeric(12,2) not null check (price_per_night >= 0),
  price_range text,
  location text not null,
  latitude double precision not null,
  longitude double precision not null,
  city text not null,
  country text not null,
  rating numeric(2,1) not null default 0 check (rating >= 0 and rating <= 5),
  amenities text[] not null default '{}',
  featured boolean not null default false,
  approval_status text not null default 'pending',
  available_rooms integer not null default 0 check (available_rooms >= 0),
  cover_image text,
  policies text,
  check_in_time text,
  check_out_time text,
  images text[] not null default '{}',
  rooms jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.hotels add column if not exists payout_method jsonb;
alter table public.hotels add column if not exists commission_rate numeric(5,2) not null default 0.00;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  check_in date not null,
  check_out date not null,
  guests integer not null check (guests > 0),
  rooms integer not null check (rooms > 0),
  total_price numeric(12,2) not null check (total_price >= 0),
  payment_status public.payment_status not null default 'pending',
  booking_status public.booking_status not null default 'pending',
  created_at timestamptz not null default now(),
  constraint valid_booking_dates check (check_out > check_in)
);

create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  unique (user_id, hotel_id)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  review text not null,
  created_at timestamptz not null default now(),
  unique (user_id, hotel_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  status public.payment_status not null default 'pending',
  payment_method text not null,
  provider_reference text,
  created_at timestamptz not null default now()
);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid references public.hotels(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  commission numeric(12,2) not null default 0.00,
  hotel_share numeric(12,2) not null default 0.00,
  status text not null default 'simulated',
  method jsonb,
  simulated boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.webhook_logs (
  id uuid primary key default gen_random_uuid(),
  event_id text,
  event_name text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null unique,
  platform text not null,
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.users where id = auth.uid() and role = 'admin' and disabled = false);
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (
    id,
    fullname,
    email,
    role,
    vendor_status,
    business_name,
    business_description,
    business_document_url
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'fullname', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'user')::public.user_role,
    coalesce(new.raw_user_meta_data->>'vendor_status', 'approved'),
    new.raw_user_meta_data->>'business_name',
    new.raw_user_meta_data->>'business_description',
    new.raw_user_meta_data->>'business_document_url'
  );
  return new;
end;
$$;

create or replace function public.notify_booking_events()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  hotel_owner uuid;
begin
  select owner_id into hotel_owner from public.hotels where id = case when tg_op = 'DELETE' then old.hotel_id else new.hotel_id end;

  if tg_op = 'INSERT' and hotel_owner is not null then
    insert into public.notifications (user_id, title, message)
    values (hotel_owner, 'New booking request', 'A guest has requested a booking for your hotel.');
  elsif tg_op = 'DELETE' and hotel_owner is not null then
    insert into public.notifications (user_id, title, message)
    values (hotel_owner, 'Booking deleted', 'A guest deleted a booking for your hotel.');
  elsif tg_op = 'UPDATE' then
    if old.booking_status is distinct from new.booking_status then
      insert into public.notifications (user_id, title, message)
      values (
        new.user_id,
        case new.booking_status
          when 'confirmed' then 'Booking confirmed'
          when 'cancelled' then 'Booking cancelled'
          else 'Booking status updated'
        end,
        case new.booking_status
          when 'confirmed' then 'The hotel confirmed your booking. You can now complete payment.'
          when 'cancelled' then 'The hotel cancelled your booking.'
          else 'Your booking status has changed.'
        end
      );
    end if;
    if old.payment_status is distinct from new.payment_status and new.payment_status = 'paid' then
      insert into public.notifications (user_id, title, message)
      values (new.user_id, 'Payment received', 'Your booking payment was received successfully.');
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists booking_notification_events on public.bookings;
create trigger booking_notification_events
after insert or update of booking_status, payment_status or delete on public.bookings
for each row execute procedure public.notify_booking_events();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.users enable row level security;
alter table public.hotels enable row level security;
alter table public.bookings enable row level security;
alter table public.favorites enable row level security;
alter table public.reviews enable row level security;
alter table public.payments enable row level security;
alter table public.notifications enable row level security;
alter table public.push_tokens enable row level security;

create policy "users read own or admin" on public.users for select using (id = auth.uid() or public.is_admin());
create policy "users update own or admin" on public.users for update using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

create policy "hotels public read" on public.hotels for select using (approval_status = 'approved' or owner_id = auth.uid() or public.is_admin());
create policy "hotels admin write" on public.hotels for all using (public.is_admin()) with check (public.is_admin());
create policy "hotels owner manage" on public.hotels for all using (owner_id = auth.uid() or public.is_admin()) with check (owner_id = auth.uid() or public.is_admin());

create policy "bookings read own or vendor or admin" on public.bookings for select using (
  user_id = auth.uid() or public.is_admin() or exists(select 1 from public.hotels h where h.id = hotel_id and h.owner_id = auth.uid())
);
create policy "bookings create own" on public.bookings for insert with check (user_id = auth.uid());
create policy "bookings update own or vendor or admin" on public.bookings for update using (
  user_id = auth.uid() or public.is_admin() or exists(select 1 from public.hotels h where h.id = hotel_id and h.owner_id = auth.uid())
) with check (
  user_id = auth.uid() or public.is_admin() or exists(select 1 from public.hotels h where h.id = hotel_id and h.owner_id = auth.uid())
);
create policy "bookings delete own or admin" on public.bookings for delete using (user_id = auth.uid() or public.is_admin());

create policy "favorites own" on public.favorites for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "reviews public read" on public.reviews for select using (true);
create policy "reviews own create" on public.reviews for insert with check (user_id = auth.uid());
create policy "reviews own update delete or admin" on public.reviews for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

create policy "payments read own or admin" on public.payments for select using (
  public.is_admin() or exists(
    select 1 from public.bookings b
    join public.hotels h on h.id = b.hotel_id
    where b.id = booking_id and (b.user_id = auth.uid() or h.owner_id = auth.uid())
  )
);
create policy "payments admin write" on public.payments for all using (public.is_admin()) with check (public.is_admin());

create policy "notifications own or admin" on public.notifications for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "push tokens own" on public.push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets (id, name, public) values ('hotel-images', 'hotel-images', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('profile-images', 'profile-images', true) on conflict (id) do nothing;

create policy "hotel images public read" on storage.objects for select using (bucket_id = 'hotel-images');
create policy "hotel images admin write" on storage.objects for all using (bucket_id = 'hotel-images' and public.is_admin()) with check (bucket_id = 'hotel-images' and public.is_admin());
create policy "profile images public read" on storage.objects for select using (bucket_id = 'profile-images');
create policy "profile images own write" on storage.objects for all using (bucket_id = 'profile-images' and auth.uid()::text = (storage.foldername(name))[1]) with check (bucket_id = 'profile-images' and auth.uid()::text = (storage.foldername(name))[1]);

create index hotels_city_idx on public.hotels(city);
create index hotels_featured_idx on public.hotels(featured);
create index bookings_user_idx on public.bookings(user_id);
create index bookings_hotel_idx on public.bookings(hotel_id);
