delete from auth.users as auth_user
where not exists (
  select 1
  from public.users as app_user
  where app_user.id = auth_user.id
);

alter table public.hotels
  drop constraint if exists hotels_owner_id_fkey,
  add constraint hotels_owner_id_fkey
    foreign key (owner_id) references public.users(id) on delete cascade;

alter table public.bookings
  alter column user_id drop not null,
  alter column hotel_id drop not null,
  drop constraint if exists bookings_user_id_fkey,
  drop constraint if exists bookings_hotel_id_fkey,
  add constraint bookings_user_id_fkey
    foreign key (user_id) references public.users(id) on delete set null,
  add constraint bookings_hotel_id_fkey
    foreign key (hotel_id) references public.hotels(id) on delete set null;

alter table public.payments
  alter column booking_id drop not null,
  drop constraint if exists payments_booking_id_fkey,
  add constraint payments_booking_id_fkey
    foreign key (booking_id) references public.bookings(id) on delete set null;

alter table public.payouts
  alter column hotel_id drop not null,
  alter column booking_id drop not null,
  drop constraint if exists payouts_hotel_id_fkey,
  drop constraint if exists payouts_booking_id_fkey,
  add constraint payouts_hotel_id_fkey
    foreign key (hotel_id) references public.hotels(id) on delete set null,
  add constraint payouts_booking_id_fkey
    foreign key (booking_id) references public.bookings(id) on delete set null;

create or replace function public.delete_auth_user_after_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() = 1 then
    delete from auth.users
    where id = old.id;
  end if;

  return old;
end;
$$;

drop trigger if exists delete_auth_user_after_profile_delete on public.users;
create trigger delete_auth_user_after_profile_delete
after delete on public.users
for each row
execute function public.delete_auth_user_after_profile_delete();
