alter table public.notifications
  add column if not exists booking_id uuid references public.bookings(id) on delete set null;

create index if not exists notifications_booking_idx
  on public.notifications(booking_id)
  where booking_id is not null;

drop trigger if exists prevent_client_booking_insert on public.bookings;
drop trigger if exists prevent_client_booking_update on public.bookings;

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
           updated_at = now()
     where id = new.booking_id
       and payment_status is distinct from new.status;
  end if;

  return new;
end;
$$;

drop trigger if exists payment_status_updates_booking on public.payments;
create trigger payment_status_updates_booking
after update of status on public.payments
for each row
execute function public.sync_payment_status_to_booking();

create or replace function public.notify_booking_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hotel_owner uuid;
begin
  if tg_op = 'DELETE' then
    select owner_id into hotel_owner
      from public.hotels
     where id = old.hotel_id;

    if hotel_owner is not null and hotel_owner <> old.user_id then
      insert into public.notifications (user_id, title, message)
      values (hotel_owner, 'Booking cancelled', 'A guest booking was removed.');
    end if;

    return old;
  end if;

  select owner_id into hotel_owner
    from public.hotels
   where id = new.hotel_id;

  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, booking_id, title, message)
    values (
      new.user_id,
      new.id,
      'Booking request received',
      'Your booking request has been created. We will let you know when the hotel responds.'
    );

    if hotel_owner is not null and hotel_owner <> new.user_id then
      insert into public.notifications (user_id, booking_id, title, message)
      values (
        hotel_owner,
        new.id,
        'New booking request',
        'A guest has requested a stay at your hotel.'
      );
    end if;

    return new;
  end if;

  if old.booking_status is distinct from new.booking_status
     and new.user_id is distinct from hotel_owner then
    insert into public.notifications (user_id, booking_id, title, message)
    values (
      new.user_id,
      new.id,
      case new.booking_status
        when 'confirmed' then 'Booking accepted'
        when 'cancelled' then 'Booking cancelled'
        when 'completed' then 'Stay completed'
        else 'Booking status updated'
      end,
      case new.booking_status
        when 'confirmed' then 'The hotel accepted your booking. You can continue with payment.'
        when 'cancelled' then 'Your booking was cancelled.'
        when 'completed' then 'Your stay was marked as complete. We hope you had a lovely trip.'
        else 'Your booking status has changed.'
      end
    );
  end if;

  if old.payment_status is distinct from new.payment_status
     and new.user_id is distinct from hotel_owner then
    insert into public.notifications (user_id, booking_id, title, message)
    values (
      new.user_id,
      new.id,
      case new.payment_status
        when 'paid' then 'Payment confirmed'
        when 'failed' then 'Payment was not completed'
        when 'refunded' then 'Payment refunded'
        else 'Payment status updated'
      end,
      case new.payment_status
        when 'paid' then 'Your payment was verified successfully. The hotel will keep you updated about your stay.'
        when 'failed' then 'We could not confirm your payment. You can retry from your booking details.'
        when 'refunded' then 'A refund for your booking has been processed.'
        else 'Your booking payment status has changed.'
      end
    );
  end if;

  return new;
end;
$$;

drop trigger if exists booking_notification_events on public.bookings;
drop trigger if exists booking_notification_insert_delete on public.bookings;
drop trigger if exists booking_notification_update on public.bookings;

create trigger booking_notification_insert_delete
after insert or delete on public.bookings
for each row
execute function public.notify_booking_events();

create trigger booking_notification_update
after update of booking_status, payment_status on public.bookings
for each row
execute function public.notify_booking_events();
