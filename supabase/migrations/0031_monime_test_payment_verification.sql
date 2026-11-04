alter table public.bookings
  add column if not exists is_test boolean not null default false;

create or replace function public.mark_monime_test_payment_paid(p_reference text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row public.payments%rowtype;
begin
  select * into payment_row
  from public.payments
  where provider_reference = p_reference
    and payment_method = 'monime'
  for update;

  if not found then
    raise exception 'Monime payment was not found';
  end if;

  if payment_row.status = 'paid' then
    update public.bookings
       set is_test = true
     where id = payment_row.booking_id;
    return;
  end if;

  if payment_row.status <> 'pending' then
    raise exception 'Only pending Monime payments can be marked paid';
  end if;

  update public.bookings
     set is_test = true
   where id = payment_row.booking_id;

  if not found then
    raise exception 'Booking for Monime payment was not found';
  end if;

  update public.payments
     set status = 'paid',
         updated_at = now()
   where id = payment_row.id;
end;
$$;

-- Only the backend service role may call this after verifying the session with Monime.
revoke all on function public.mark_monime_test_payment_paid(text) from public, anon, authenticated;
grant execute on function public.mark_monime_test_payment_paid(text) to service_role;

notify pgrst, 'reload schema';
