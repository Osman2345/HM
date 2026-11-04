create or replace function public.issue_booking_voucher()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
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
