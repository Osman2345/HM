alter table public.users
  add column if not exists vendor_payment_policy_agreed boolean not null default false,
  add column if not exists vendor_payment_policy_agreed_at timestamptz,
  add column if not exists vendor_payment_policy_version text,
  add column if not exists no_show_count integer not null default 0 check (no_show_count >= 0),
  add column if not exists booking_risk_flagged_at timestamptz;

alter table public.bookings
  add column if not exists payment_method text not null default 'monime',
  add column if not exists voucher_code text,
  add column if not exists checked_out_at timestamptz;

alter table public.bookings
  drop constraint if exists bookings_payment_method_check,
  drop constraint if exists bookings_voucher_code_unique;

alter table public.bookings
  add constraint bookings_payment_method_check
    check (payment_method in ('monime', 'pay_at_hotel')),
  add constraint bookings_voucher_code_unique unique (voucher_code);

create or replace function public.restrict_hotel_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  vendor_plan text;
  hotel_limit integer;
  existing_hotels integer;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null then
      raise exception 'Authentication required';
    end if;

    if not public.is_admin() then
      select u.plan_id, vp.max_hotels
        into vendor_plan, hotel_limit
      from public.users u
      left join public.vendor_plans vp on vp.id = u.plan_id
      where u.id = auth.uid()
        and u.role = 'vendor'
        and u.vendor_status = 'approved'
        and u.disabled = false
      for update of u;

      if not found then
        raise exception 'Only active, approved vendors can create hotels';
      end if;
      if coalesce(new.owner_id, auth.uid()) <> auth.uid() then
        raise exception 'The hotel owner must be the current authenticated user';
      end if;

      select count(*) into existing_hotels
      from public.hotels
      where owner_id = auth.uid();
      if existing_hotels >= coalesce(hotel_limit, 1) then
        if vendor_plan = 'free' then
          raise exception 'Upgrade to PRO to add more hotels';
        end if;
        raise exception 'Your PRO plan allows up to 5 hotels';
      end if;

      new.approval_status = 'approved';
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
      new.rejection_reason = old.rejection_reason;
    end if;
    return new;
  end if;
  return new;
end;
$$;

alter table public.hotels drop column if exists commission_rate;

create table if not exists public.platform_settings (
  id smallint primary key default 1 check (id = 1),
  commission_type text not null default 'percentage'
    check (commission_type in ('percentage', 'fixed_amount')),
  commission_value numeric(12, 2) not null default 15,
  currency text not null default 'SLE' check (currency = 'SLE'),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint platform_settings_commission_value_check check (
    (commission_type = 'percentage' and commission_value between 5 and 30)
    or (commission_type = 'fixed_amount' and commission_value >= 0)
  )
);

insert into public.platform_settings (id, commission_type, commission_value, currency)
values (1, 'percentage', 15, 'SLE')
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;
drop policy if exists "platform_settings_public_read" on public.platform_settings;
create policy "platform_settings_public_read" on public.platform_settings
for select using (true);
grant select on public.platform_settings to anon, authenticated;
revoke insert, update, delete on public.platform_settings from anon, authenticated;

alter table public.transactions
  add column if not exists commission_type text,
  add column if not exists commission_value numeric(12, 2),
  add column if not exists currency text not null default 'SLE',
  add column if not exists vendor_payout_status text not null default 'pending',
  add column if not exists vendor_paid_at timestamptz;

update public.bookings
set booking_status = 'checked_out'
where booking_status = 'completed' and payment_status = 'paid';

update public.transactions
set commission_type = 'percentage',
    commission_value = case
      when total_amount > 0 then round(commission_amount * 100 / total_amount, 2)
      else 0
    end
where commission_type is null or commission_value is null;

alter table public.transactions
  drop constraint if exists transactions_commission_type_check,
  drop constraint if exists transactions_vendor_payout_status_check;

alter table public.transactions
  alter column commission_type set default 'percentage',
  alter column commission_type set not null,
  alter column commission_value set default 15,
  alter column commission_value set not null,
  add constraint transactions_commission_type_check check (commission_type in ('percentage', 'fixed_amount')),
  add constraint transactions_vendor_payout_status_check check (vendor_payout_status in ('pending', 'eligible', 'paid'));

alter table public.vendor_plans drop column if exists commission_percent;

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
        or (booking.payment_status = 'pending' and booking.created_at > now() - interval '15 minutes')
        or (booking.payment_method = 'pay_at_hotel' and booking.booking_status = 'confirmed' and booking.check_out > current_date)
      )
  ) as reservations on true;
end;
$$;

grant execute on function public.get_room_availability(uuid, date, date) to anon, authenticated;

create table if not exists public.booking_no_show_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  guest_id uuid not null references public.users(id) on delete cascade,
  vendor_id uuid not null references public.users(id) on delete cascade,
  no_show_count integer not null check (no_show_count > 0),
  suspicious boolean not null default false,
  marked_at timestamptz not null default now()
);

alter table public.booking_no_show_events enable row level security;
drop policy if exists "booking_no_show_events_admin_read" on public.booking_no_show_events;
create policy "booking_no_show_events_admin_read" on public.booking_no_show_events
for select using (public.is_admin());

drop function if exists public.create_booking(uuid, text, date, date, integer, integer);
drop function if exists public.create_booking(uuid, text, date, date, integer, integer, text);
drop function if exists public.create_booking(uuid, text, date, date, integer, integer, text, numeric);

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
        or (b.payment_status = 'pending' and b.created_at > now() - interval '15 minutes')
        or (b.payment_method = 'pay_at_hotel' and b.booking_status = 'confirmed' and b.check_out > current_date)
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
  v_owner_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;
  if not found then
    raise exception 'Booking not found';
  end if;

  select owner_id into v_owner_id from public.hotels where id = v_booking.hotel_id;
  if public.is_admin() then
    null;
  elsif auth.uid() = v_booking.user_id then
    if p_status <> 'cancelled' or v_booking.booking_status not in ('pending', 'confirmed') then
      raise exception 'Guests can only cancel pending or confirmed bookings';
    end if;
  elsif v_owner_id = auth.uid() then
    if p_status not in ('confirmed', 'cancelled') then
      raise exception 'Use the checkout action to close a vendor booking';
    end if;
    if p_status = 'confirmed'
       and v_booking.payment_method = 'pay_at_hotel'
       and v_booking.created_at < now() - interval '15 minutes' then
      raise exception 'The room hold expired. Ask the guest to check availability again.';
    end if;
  else
    raise exception 'You do not have permission to change this booking status';
  end if;

  update public.bookings
  set booking_status = p_status, updated_at = now()
  where id = p_booking_id
  returning * into v_booking;
  return v_booking;
end;
$$;

revoke all on function public.set_booking_status(uuid, public.booking_status) from public;
grant execute on function public.set_booking_status(uuid, public.booking_status) to authenticated;

create or replace function public.issue_booking_voucher()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.booking_status in ('cancelled', 'no_show') or new.payment_status in ('failed', 'refunded') then
    new.voucher_code := null;
    return new;
  end if;

  if new.payment_status = 'paid'
     or (new.payment_method = 'pay_at_hotel' and new.booking_status = 'confirmed') then
    if new.voucher_code is null then
      new.voucher_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists issue_booking_voucher on public.bookings;
create trigger issue_booking_voucher
before insert or update of booking_status, payment_status, payment_method on public.bookings
for each row execute function public.issue_booking_voucher();

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

create or replace function public.record_paid_booking_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_vendor_id uuid;
  commission_kind text;
  commission_setting numeric(12,2);
  settings_currency text;
  commission_value numeric(12,2);
  payout_value numeric(12,2);
begin
  if new.payment_status <> 'paid' or old.payment_status = 'paid' then
    return new;
  end if;

  select h.owner_id into booking_vendor_id
  from public.hotels h
  where h.id = new.hotel_id;
  if booking_vendor_id is null then
    return new;
  end if;

  select s.commission_type, s.commission_value, s.currency
  into commission_kind, commission_setting, settings_currency
  from public.platform_settings s
  where s.id = 1;
  commission_kind := coalesce(commission_kind, 'percentage');
  commission_setting := coalesce(commission_setting, 15);
  settings_currency := coalesce(settings_currency, 'SLE');

  if commission_kind = 'fixed_amount' then
    commission_value := least(new.total_price, commission_setting);
  else
    commission_value := round(new.total_price * commission_setting / 100, 2);
  end if;
  payout_value := greatest(0, new.total_price - commission_value);

  insert into public.transactions (
    booking_id, vendor_id, hotel_id, total_amount, commission_amount,
    hotel_payout_amount, status, commission_type, commission_value, currency,
    vendor_payout_status
  ) values (
    new.id, booking_vendor_id, new.hotel_id, new.total_price, commission_value,
    payout_value, 'paid', commission_kind, commission_setting, settings_currency,
    case when new.booking_status = 'checked_out' then 'eligible' else 'pending' end
  ) on conflict (booking_id) do nothing;

  return new;
end;
$$;

drop trigger if exists record_paid_booking_transaction on public.bookings;
create trigger record_paid_booking_transaction
after update of payment_status on public.bookings
for each row execute function public.record_paid_booking_transaction();

create or replace function public.refresh_vendor_payout_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.booking_status = 'checked_out' and old.booking_status is distinct from 'checked_out' then
    update public.transactions
    set vendor_payout_status = 'eligible'
    where booking_id = new.id and vendor_payout_status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_vendor_payout_eligibility on public.bookings;
create trigger refresh_vendor_payout_eligibility
after update of booking_status on public.bookings
for each row execute function public.refresh_vendor_payout_eligibility();

update public.transactions t
set vendor_payout_status = 'eligible'
from public.bookings b
where b.id = t.booking_id
  and b.booking_status = 'checked_out'
  and b.payment_status = 'paid'
  and t.vendor_payout_status = 'pending';

create or replace function public.vendor_update_booking_status(
  p_booking_id uuid,
  p_status text
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_owner_id uuid;
  v_no_show_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not exists (
    select 1 from public.users
    where id = auth.uid() and role = 'vendor' and disabled = false
  ) then
    raise exception 'An active vendor account is required';
  end if;
  if p_status not in ('confirmed', 'cancelled', 'checked_out', 'no_show') then
    raise exception 'Unsupported vendor booking action';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;
  if not found then
    raise exception 'Booking not found for this vendor';
  end if;
  select h.owner_id into v_owner_id
  from public.hotels h
  where h.id = v_booking.hotel_id;
  if v_owner_id is distinct from auth.uid() then
    raise exception 'Booking not found for this vendor';
  end if;

  if p_status = 'confirmed' then
    if v_booking.booking_status <> 'pending' then
      raise exception 'Only pending bookings can be confirmed';
    end if;
    if v_booking.payment_method = 'pay_at_hotel'
       and v_booking.created_at < now() - interval '15 minutes' then
      raise exception 'The room hold expired. Ask the guest to check availability again.';
    end if;
    if v_booking.payment_method = 'monime' and v_booking.payment_status <> 'paid' then
      raise exception 'Online bookings must be paid before confirmation';
    end if;
    update public.bookings set booking_status = 'confirmed' where id = p_booking_id returning * into v_booking;
  elsif p_status = 'cancelled' then
    if v_booking.booking_status not in ('pending', 'confirmed') or v_booking.payment_status = 'paid' then
      raise exception 'This booking cannot be cancelled by the vendor';
    end if;
    update public.bookings set booking_status = 'cancelled' where id = p_booking_id returning * into v_booking;
  elsif p_status = 'checked_out' then
    if v_booking.booking_status <> 'confirmed'
       or v_booking.check_out > current_date then
      raise exception 'Confirmed bookings can be checked out only after the checkout date';
    end if;
    if v_booking.payment_method = 'pay_at_hotel' then
      update public.bookings
      set payment_status = 'paid', booking_status = 'checked_out', checked_out_at = now()
      where id = p_booking_id returning * into v_booking;
    elsif v_booking.payment_status = 'paid' then
      update public.bookings
      set booking_status = 'checked_out', checked_out_at = now()
      where id = p_booking_id returning * into v_booking;
    else
      raise exception 'Online payment must be settled before checkout';
    end if;
  else
    if v_booking.booking_status <> 'confirmed'
       or v_booking.check_in > current_date
       or v_booking.check_out <= current_date then
      raise exception 'Only a confirmed booking can be marked no-show after check-in';
    end if;
    update public.users
    set no_show_count = no_show_count + 1,
        booking_risk_flagged_at = case
          when no_show_count + 1 >= 2 then coalesce(booking_risk_flagged_at, now())
          else booking_risk_flagged_at
        end
    where id = v_booking.user_id
    returning no_show_count into v_no_show_count;

    insert into public.booking_no_show_events (booking_id, guest_id, vendor_id, no_show_count, suspicious)
    values (v_booking.id, v_booking.user_id, auth.uid(), v_no_show_count, v_no_show_count >= 2);

    update public.bookings
    set booking_status = 'no_show'
    where id = p_booking_id returning * into v_booking;
  end if;
  return v_booking;
end;
$$;

revoke all on function public.vendor_update_booking_status(uuid, text) from public;
grant execute on function public.vendor_update_booking_status(uuid, text) to authenticated;

create or replace function public.get_vendor_booking_contact(p_booking_id uuid)
returns table (guest_name text, guest_phone text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  return query
  select u.fullname, u.phone
  from public.bookings b
  join public.hotels h on h.id = b.hotel_id
  join public.users u on u.id = b.user_id
  where b.id = p_booking_id
    and h.owner_id = auth.uid()
    and exists (
      select 1 from public.users vendor
      where vendor.id = auth.uid() and vendor.role = 'vendor' and vendor.disabled = false
    )
    and (b.payment_status = 'paid' or b.booking_status = 'confirmed');
end;
$$;

revoke all on function public.get_vendor_booking_contact(uuid) from public;
grant execute on function public.get_vendor_booking_contact(uuid) to authenticated;

create or replace function public.admin_financial_overview()
returns table (total_commission numeric, total_vendor_payouts numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required';
  end if;
  return query
  select coalesce(sum(t.commission_amount), 0),
         coalesce(sum(t.hotel_payout_amount), 0)
  from public.transactions t;
end;
$$;

revoke all on function public.admin_financial_overview() from public;
grant execute on function public.admin_financial_overview() to authenticated;

create or replace function public.admin_update_vendor_payout(
  p_transaction_id uuid,
  p_status text
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_transaction public.transactions%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required';
  end if;
  if p_status not in ('eligible', 'paid') then
    raise exception 'Invalid vendor payout status';
  end if;
  if p_status = 'eligible' and not exists (
    select 1
    from public.transactions t
    join public.bookings b on b.id = t.booking_id
    where t.id = p_transaction_id
      and b.booking_status = 'checked_out'
      and b.payment_status = 'paid'
  ) then
    raise exception 'A vendor payout becomes eligible only after a paid booking is checked out';
  end if;
  update public.transactions
  set vendor_payout_status = p_status,
      vendor_paid_at = case when p_status = 'paid' then now() else null end
  where id = p_transaction_id
    and (p_status <> 'paid' or vendor_payout_status = 'eligible')
  returning * into saved_transaction;
  if not found then
    raise exception 'Payout must be eligible before it can be marked paid';
  end if;
  return saved_transaction;
end;
$$;

revoke all on function public.admin_update_vendor_payout(uuid, text) from public;
grant execute on function public.admin_update_vendor_payout(uuid, text) to authenticated;

create or replace function public.prevent_vendor_payment_policy_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.vendor_payment_policy_agreed := old.vendor_payment_policy_agreed;
    new.vendor_payment_policy_agreed_at := old.vendor_payment_policy_agreed_at;
    new.vendor_payment_policy_version := old.vendor_payment_policy_version;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_vendor_payment_policy_change on public.users;
create trigger prevent_vendor_payment_policy_change
before update of vendor_payment_policy_agreed, vendor_payment_policy_agreed_at, vendor_payment_policy_version
on public.users
for each row execute function public.prevent_vendor_payment_policy_change();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_vendor boolean := coalesce(new.raw_user_meta_data->>'role', 'user') = 'vendor';
begin
  insert into public.users (
    id, fullname, email, role, vendor_status, business_name, business_description,
    business_document_url, vendor_terms_accepted_at, vendor_terms_version,
    vendor_payment_policy_agreed, vendor_payment_policy_agreed_at, vendor_payment_policy_version
  ) values (
    new.id,
    coalesce(new.raw_user_meta_data->>'fullname', split_part(new.email, '@', 1)),
    new.email,
    case when is_vendor then 'vendor'::public.user_role else 'user'::public.user_role end,
    case when is_vendor then 'pending' else 'approved' end,
    new.raw_user_meta_data->>'business_name',
    new.raw_user_meta_data->>'business_description',
    new.raw_user_meta_data->>'business_document_url',
    case when is_vendor then nullif(new.raw_user_meta_data->>'vendor_terms_accepted_at', '')::timestamptz else null end,
    case when is_vendor then new.raw_user_meta_data->>'vendor_terms_version' else null end,
    is_vendor and coalesce(new.raw_user_meta_data->>'vendor_payment_policy_agreed', 'false') = 'true',
    case when is_vendor then nullif(new.raw_user_meta_data->>'vendor_payment_policy_agreed_at', '')::timestamptz else null end,
    case when is_vendor then new.raw_user_meta_data->>'vendor_payment_policy_version' else null end
  );
  return new;
end;
$$;
