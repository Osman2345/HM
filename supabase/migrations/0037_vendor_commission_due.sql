do $$
begin
  create type public.payment_type as enum ('orange_money', 'afrimoney', 'pay_at_hotel');
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.commission_status as enum ('paid', 'unpaid', 'not_applicable');
exception
  when duplicate_object then null;
end;
$$;

alter table public.bookings
  add column if not exists payment_type public.payment_type not null default 'orange_money',
  add column if not exists commission numeric(12, 2) not null default 0,
  add column if not exists commission_status public.commission_status not null default 'unpaid';

alter table public.bookings alter column is_test set default true;

alter table public.bookings
  drop constraint if exists bookings_payment_type_check,
  drop constraint if exists bookings_commission_status_check,
  drop constraint if exists bookings_commission_nonnegative_check;

alter table public.bookings
  add constraint bookings_payment_type_check
    check (payment_type in ('orange_money', 'afrimoney', 'pay_at_hotel')),
  add constraint bookings_commission_status_check
    check (commission_status in ('paid', 'unpaid', 'not_applicable')),
  add constraint bookings_commission_nonnegative_check
    check (commission >= 0);

update public.bookings
set payment_type = case
      when payment_method = 'pay_at_hotel' then 'pay_at_hotel'
      else payment_type
    end,
    commission = round(greatest(total_price, 0) * 0.15, 2),
    commission_status = case
      when total_price = 0 then 'not_applicable'::public.commission_status
      when payment_method = 'pay_at_hotel' then 'unpaid'::public.commission_status
      when payment_status = 'paid' then 'paid'::public.commission_status
      else 'unpaid'::public.commission_status
    end;

update public.bookings
set payment_status = 'reserved_not_paid'
where payment_method = 'pay_at_hotel'
  and payment_status = 'pending';

create table if not exists public.vendor_wallets (
  vendor_id uuid primary key references public.users(id) on delete cascade,
  commission_due numeric(12, 2) not null default 0 check (commission_due >= 0),
  total_earnings numeric(12, 2) not null default 0 check (total_earnings >= 0),
  can_receive_bookings boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.vendor_wallets (vendor_id)
select id from public.users where role = 'vendor'
on conflict (vendor_id) do nothing;

update public.vendor_wallets w
set commission_due = coalesce((
      select sum(b.commission)
      from public.bookings b
      join public.hotels h on h.id = b.hotel_id
      where h.owner_id = w.vendor_id
        and b.payment_method = 'pay_at_hotel'
        and b.commission_status = 'unpaid'
    ), 0),
    can_receive_bookings = coalesce((
      select sum(b.commission)
      from public.bookings b
      join public.hotels h on h.id = b.hotel_id
      where h.owner_id = w.vendor_id
        and b.payment_method = 'pay_at_hotel'
        and b.commission_status = 'unpaid'
    ), 0) <= 500,
    updated_at = now();

alter table public.vendor_wallets enable row level security;

drop policy if exists "vendor_wallets_read_owner_or_admin" on public.vendor_wallets;
create policy "vendor_wallets_read_owner_or_admin" on public.vendor_wallets
for select using (vendor_id = auth.uid() or public.is_admin());

grant select on public.vendor_wallets to authenticated;

create table if not exists public.vendor_commission_payments (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.users(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  payment_type text not null check (payment_type in ('orange_money', 'afrimoney')),
  phone_number text not null,
  is_test boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.vendor_commission_payments enable row level security;

drop policy if exists "vendor_commission_payments_read_owner_or_admin" on public.vendor_commission_payments;
create policy "vendor_commission_payments_read_owner_or_admin" on public.vendor_commission_payments
for select using (vendor_id = auth.uid() or public.is_admin());

grant select on public.vendor_commission_payments to authenticated;

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
    select h.owner_id into booking_vendor_id
    from public.hotels h
    where h.id = new.hotel_id;

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

    if wallet_row.commission_due > 500 or not wallet_row.can_receive_bookings then
      raise exception 'Account blocked: Please clear commission due Le % to receive new bookings',
        to_char(wallet_row.commission_due, 'FM999999999999990.00');
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

drop trigger if exists prepare_booking_commission on public.bookings;
create trigger prepare_booking_commission
before insert or update on public.bookings
for each row execute function public.prepare_booking_commission();

create or replace function public.prevent_pay_at_hotel_test_release()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.payment_method = 'pay_at_hotel' and new.booking_status = 'completed' then
    raise exception 'Pay-at-hotel bookings cannot use the online TEST fund release';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_pay_at_hotel_test_release on public.bookings;
create trigger prevent_pay_at_hotel_test_release
before update of booking_status on public.bookings
for each row execute function public.prevent_pay_at_hotel_test_release();

create or replace function public.track_pay_at_hotel_commission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_vendor_id uuid;
begin
  if new.payment_method <> 'pay_at_hotel' or new.commission <= 0 then
    return new;
  end if;

  select h.owner_id into booking_vendor_id
  from public.hotels h
  where h.id = new.hotel_id;

  if booking_vendor_id is null then
    raise exception 'The booking property has no vendor account';
  end if;

  insert into public.vendor_wallets (vendor_id)
  values (booking_vendor_id)
  on conflict (vendor_id) do nothing;

  update public.vendor_wallets
  set commission_due = commission_due + new.commission,
      can_receive_bookings = commission_due + new.commission <= 500,
      updated_at = now()
  where vendor_id = booking_vendor_id;

  return new;
end;
$$;

drop trigger if exists track_pay_at_hotel_commission on public.bookings;
create trigger track_pay_at_hotel_commission
after insert on public.bookings
for each row execute function public.track_pay_at_hotel_commission();

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
    select room_item.value->>'type' as room_type,
      sum(greatest(coalesce((room_item.value->>'total_rooms')::integer, 0), 0))::integer as total_rooms
    from public.hotels as hotel
    cross join lateral jsonb_array_elements(coalesce(hotel.rooms, '[]'::jsonb)) as room_item(value)
    where hotel.id = p_hotel_id and hotel.approval_status = 'approved'
    group by room_item.value->>'type'
  )
  select room_types.room_type,
    room_types.total_rooms,
    coalesce(reservations.reserved_rooms, 0),
    greatest(room_types.total_rooms - coalesce(reservations.reserved_rooms, 0), 0)
  from room_types
  left join lateral (
    select sum(booking.rooms)::integer as reserved_rooms
    from public.bookings as booking
    where booking.hotel_id = p_hotel_id
      and booking.room_type = room_types.room_type
      and booking.booking_status not in ('cancelled', 'no_show')
      and booking.check_in < p_check_out
      and booking.check_out > p_check_in
      and (
        booking.payment_status = 'paid'
        or (
          booking.payment_status in ('pending', 'reserved_not_paid')
          and booking.created_at > now() - interval '15 minutes'
        )
        or (
          booking.payment_method = 'pay_at_hotel'
          and booking.booking_status = 'confirmed'
          and booking.check_out > current_date
        )
      )
  ) as reservations on true;
end;
$$;

grant execute on function public.get_room_availability(uuid, date, date) to anon, authenticated;

create or replace function public.create_booking(
  p_hotel_id uuid,
  p_room_type text,
  p_check_in date,
  p_check_out date,
  p_guests integer,
  p_rooms integer,
  p_payment_method text default 'monime'
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
  v_checkout_minutes integer;
  v_booking public.bookings%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_payment_method not in ('monime', 'pay_at_hotel') then
    raise exception 'Choose a supported booking payment method';
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
  if not found or v_hotel.approval_status <> 'approved' then
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
  if v_hotel.check_out_time ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' then
    v_checkout_minutes := split_part(v_hotel.check_out_time, ':', 1)::integer * 60
      + split_part(v_hotel.check_out_time, ':', 2)::integer;
    if v_nights > 1 and v_checkout_minutes < 720 then
      v_total_price := v_total_price
        + round(v_room_price * (v_nights - 1) * 0.15, 2) * p_rooms;
    end if;
  end if;

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
      and b.booking_status not in ('cancelled', 'no_show')
      and b.check_in < p_check_out
      and b.check_out > p_check_in
      and (
        b.payment_status = 'paid'
        or (
          b.payment_status in ('pending', 'reserved_not_paid')
          and b.created_at > now() - interval '15 minutes'
        )
        or (
          b.payment_method = 'pay_at_hotel'
          and b.booking_status = 'confirmed'
          and b.check_out > current_date
        )
      )
  ), 0);
  if v_booked_rooms + p_rooms > v_total_capacity then
    raise exception 'Not enough rooms of this type are available for the selected dates';
  end if;

  insert into public.bookings (
    user_id, hotel_id, room_type, check_in, check_out, guests, rooms,
    total_price, payment_status, booking_status, payment_method
  ) values (
    v_user_id, p_hotel_id, p_room_type, p_check_in, p_check_out, p_guests, p_rooms,
    v_total_price, 'pending', 'pending', p_payment_method
  ) returning * into v_booking;
  return v_booking;
end;
$$;

revoke all on function public.create_booking(uuid, text, date, date, integer, integer, text) from public;
grant execute on function public.create_booking(uuid, text, date, date, integer, integer, text) to authenticated;

create or replace function public.sync_payment_status_to_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status then
    update public.bookings
    set payment_status = new.status,
        payment_type = case new.test_payment_method
          when 'orange' then 'orange_money'::public.payment_type
          when 'afri' then 'afrimoney'::public.payment_type
          else payment_type
        end,
        commission_status = case
          when new.status = 'paid' and payment_method <> 'pay_at_hotel' and commission > 0 then 'paid'::public.commission_status
          when new.status = 'paid' and payment_method <> 'pay_at_hotel' and commission = 0 then 'not_applicable'::public.commission_status
          else commission_status
        end,
        booking_status = case
          when new.status = 'paid' then 'confirmed'::public.booking_status
          when new.status in ('failed', 'refunded') and payment_method = 'monime' then 'cancelled'::public.booking_status
          else booking_status
        end,
        updated_at = now()
    where id = new.booking_id
      and payment_status is distinct from new.status;
  end if;
  return new;
end;
$$;

create or replace function public.pay_vendor_commission_due(
  p_payment_type text,
  p_phone_number text,
  p_pin text,
  p_expected_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  vendor_wallet public.vendor_wallets%rowtype;
  vendor_booking record;
  commission_total numeric(12, 2) := 0;
  earnings_total numeric(12, 2) := 0;
  settled_total numeric(12, 2);
begin
  if auth.uid() is null or not exists (
    select 1 from public.users
    where id = auth.uid() and role = 'vendor' and disabled = false
  ) then
    raise exception 'An active vendor account is required';
  end if;
  if p_payment_type is null or p_payment_type not in ('orange_money', 'afrimoney') then
    raise exception 'Choose Orange Money or Afrimoney TEST';
  end if;
  if p_phone_number is null or p_phone_number !~ '^[0-9+]{8,18}$' then
    raise exception 'Enter a valid TEST phone number';
  end if;
  if p_pin is distinct from '1234' then
    raise exception 'Enter the TEST PIN 1234 to simulate commission payment';
  end if;
  if p_expected_amount is null or p_expected_amount <= 0 then
    raise exception 'A positive commission payment amount is required';
  end if;

  select * into vendor_wallet
  from public.vendor_wallets
  where vendor_id = auth.uid()
  for update;

  if not found or vendor_wallet.commission_due <= 0 then
    raise exception 'There is no commission due to pay';
  end if;
  if round(p_expected_amount, 2) <> vendor_wallet.commission_due then
    raise exception 'Commission due changed. Refresh the dashboard and try again.';
  end if;

  for vendor_booking in
    select b.id, b.total_price, b.commission, b.hotel_id
    from public.bookings b
    join public.hotels h on h.id = b.hotel_id
    where h.owner_id = auth.uid()
      and b.payment_method = 'pay_at_hotel'
      and b.commission_status = 'unpaid'
    order by b.created_at
    for update of b
  loop
    commission_total := commission_total + vendor_booking.commission;
    earnings_total := earnings_total
      + greatest(0, vendor_booking.total_price - vendor_booking.commission);

    update public.bookings
    set commission_status = 'paid',
        updated_at = now()
    where id = vendor_booking.id;

    insert into public.transactions (
      booking_id, vendor_id, hotel_id, total_amount, commission_amount,
      hotel_payout_amount, status, commission_type, commission_value,
      currency, vendor_payout_status, is_test
    ) values (
      vendor_booking.id, auth.uid(), vendor_booking.hotel_id,
      vendor_booking.total_price, vendor_booking.commission,
      greatest(0, vendor_booking.total_price - vendor_booking.commission),
      'paid', 'percentage', 15, 'SLE', 'pending', true
    )
    on conflict (booking_id) do update
    set total_amount = excluded.total_amount,
        commission_amount = excluded.commission_amount,
        hotel_payout_amount = excluded.hotel_payout_amount,
        is_test = true;
  end loop;

  settled_total := round(commission_total, 2);
  if settled_total <= 0 or settled_total <> vendor_wallet.commission_due then
    raise exception 'Commission ledger mismatch. Refresh the dashboard and try again.';
  end if;

  insert into public.vendor_commission_payments (
    vendor_id, amount, payment_type, phone_number, is_test
  ) values (
    auth.uid(), settled_total, p_payment_type, p_phone_number, true
  );

  update public.vendor_wallets
  set commission_due = 0,
      total_earnings = total_earnings + round(earnings_total, 2),
      can_receive_bookings = true,
      updated_at = now()
  where vendor_id = auth.uid();

  return jsonb_build_object(
    'commission_due', 0,
    'total_earnings', vendor_wallet.total_earnings + round(earnings_total, 2),
    'paid_amount', settled_total,
    'is_test', true
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
      and b.total_price = 1
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

revoke all on function public.admin_release_all_pending_test_booking_funds() from public, anon, authenticated;
grant execute on function public.admin_release_all_pending_test_booking_funds() to service_role;

revoke all on function public.pay_vendor_commission_due(text, text, text, numeric) from public, anon, authenticated;
grant execute on function public.pay_vendor_commission_due(text, text, text, numeric) to authenticated;

notify pgrst, 'reload schema';
