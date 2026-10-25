create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('user', 'vendor', 'admin');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'booking_status') then
    create type public.booking_status as enum ('pending', 'confirmed', 'cancelled', 'completed');
  end if;
end $$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  fullname text not null,
  email text not null unique,
  phone text,
  profile_image text,
  role public.user_role not null default 'user',
  location text,
  preferences jsonb not null default '{}'::jsonb,
  disabled boolean not null default false,
  vendor_status text not null default 'pending',
  business_name text,
  business_description text,
  business_logo text,
  business_document_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hotels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.users(id) on delete set null,
  name text not null,
  description text not null,
  location text not null,
  latitude double precision not null,
  longitude double precision not null,
  city text not null,
  country text not null,
  rating numeric(3,1) not null default 0 check (rating >= 0 and rating <= 5),
  review_count integer not null default 0 check (review_count >= 0),
  amenities text[] not null default '{}',
  featured boolean not null default false,
  approval_status text not null default 'pending',
  rejection_reason text,
  cover_image text,
  policies text,
  check_in_time text,
  check_out_time text,
  images text[] not null default '{}',
  rooms jsonb not null default '[]'::jsonb,
  commission_rate numeric(5,2) not null default 0.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  room_type text,
  check_in date not null,
  check_out date not null,
  guests integer not null check (guests > 0),
  rooms integer not null check (rooms > 0),
  total_price numeric(12,2) not null check (total_price >= 0),
  payment_status public.payment_status not null default 'pending',
  booking_status public.booking_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_booking_dates check (check_out > check_in)
);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, hotel_id)
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  review text not null,
  created_at timestamptz not null default now(),
  unique (user_id, hotel_id)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  status public.payment_status not null default 'pending',
  payment_method text not null,
  provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  commission numeric(12,2) not null default 0.00,
  hotel_share numeric(12,2) not null default 0.00,
  status text not null default 'pending',
  method jsonb,
  simulated boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_logs (
  id uuid primary key default gen_random_uuid(),
  event_id text,
  event_name text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null unique,
  platform text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role = 'admin'
      and disabled = false
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
    case
      when coalesce(new.raw_user_meta_data->>'role', 'user') in ('user', 'vendor') then coalesce(new.raw_user_meta_data->>'role', 'user')::public.user_role
      else 'user'::public.user_role
    end,
    case
      when coalesce(new.raw_user_meta_data->>'role', 'user') = 'vendor' then 'pending'
      else 'approved'
    end,
    new.raw_user_meta_data->>'business_name',
    new.raw_user_meta_data->>'business_description',
    new.raw_user_meta_data->>'business_document_url'
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();

alter table public.users enable row level security;
alter table public.hotels enable row level security;
alter table public.bookings enable row level security;
alter table public.favorites enable row level security;
alter table public.reviews enable row level security;
alter table public.payments enable row level security;
alter table public.payouts enable row level security;
alter table public.webhook_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.push_tokens enable row level security;

create policy "users_read_own_or_admin" on public.users
for select using (id = auth.uid() or public.is_admin());

create policy "users_update_own_or_admin" on public.users
for update using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

create policy "hotels_public_read" on public.hotels
for select using (approval_status = 'approved' or owner_id = auth.uid() or public.is_admin());

create policy "hotels_owner_or_admin_write" on public.hotels
for all using (owner_id = auth.uid() or public.is_admin())
with check (owner_id = auth.uid() or public.is_admin());

create policy "bookings_read_own_or_admin_or_vendor" on public.bookings
for select using (
  user_id = auth.uid()
  or public.is_admin()
  or exists (
    select 1
    from public.hotels h
    where h.id = hotel_id and h.owner_id = auth.uid()
  )
);

create policy "bookings_delete_own_or_admin" on public.bookings
for delete using (user_id = auth.uid() or public.is_admin());

create policy "favorites_manage_own" on public.favorites
for all using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "reviews_read_all" on public.reviews for select using (true);
create policy "reviews_manage_own_or_admin" on public.reviews
for all using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

create policy "payments_read_own_or_admin" on public.payments
for select using (
  public.is_admin()
  or exists (
    select 1
    from public.bookings b
    join public.hotels h on h.id = b.hotel_id
    where b.id = booking_id and (b.user_id = auth.uid() or h.owner_id = auth.uid())
  )
);

create policy "notifications_manage_own_or_admin" on public.notifications
for all using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

create policy "push_tokens_manage_own" on public.push_tokens
for all using (user_id = auth.uid())
with check (user_id = auth.uid());

create index if not exists hotels_owner_idx on public.hotels(owner_id);
create index if not exists hotels_approval_status_idx on public.hotels(approval_status);
create index if not exists hotels_city_idx on public.hotels(city);
create index if not exists bookings_user_idx on public.bookings(user_id);
create index if not exists bookings_hotel_idx on public.bookings(hotel_id);
create index if not exists notifications_user_idx on public.notifications(user_id, read);
create index if not exists reviews_hotel_idx on public.reviews(hotel_id);
create index if not exists payouts_hotel_idx on public.payouts(hotel_id);
create index if not exists webhook_logs_event_idx on public.webhook_logs(event_id);
