update public.users
set disabled = false
where disabled is null;

alter table public.users
  alter column disabled set default false,
  alter column disabled set not null;

create or replace function public.save_withdrawal_method(
  p_provider text,
  p_phone_number text
)
returns public.withdrawal_methods
language plpgsql
security definer
set search_path = public
as $$
declare
  account_role public.user_role;
  is_disabled boolean;
  saved_method public.withdrawal_methods%rowtype;
  normalized_phone text := trim(p_phone_number);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select role, disabled into account_role, is_disabled
  from public.users
  where id = auth.uid();

  if not found then
    raise exception 'Your signed-in account profile was not found. Sign out and back in, then contact support if this continues.';
  end if;
  if is_disabled is true then
    raise exception 'This account is disabled. Ask an administrator to reactivate it before adding a withdrawal method.';
  end if;
  if account_role is null or account_role not in ('admin', 'vendor') then
    raise exception 'Withdrawals require an admin or vendor profile. The signed-in user ID is %, the profile role is %, and disabled is %.',
      auth.uid(),
      coalesce(account_role::text, 'null'),
      coalesce(is_disabled::text, 'null');
  end if;
  if p_provider not in ('orange_money', 'afri_money') then
    raise exception 'Choose Orange Money or AfriMoney';
  end if;
  if normalized_phone is null or normalized_phone !~ '^[+]?[0-9][0-9 -]{6,19}$' then
    raise exception 'Enter a valid Orange Money or AfriMoney phone number';
  end if;

  insert into public.withdrawal_methods (owner_id, provider, phone_number)
  values (auth.uid(), p_provider, normalized_phone)
  on conflict (owner_id) do update
    set provider = excluded.provider,
        phone_number = excluded.phone_number,
        updated_at = now()
  returning * into saved_method;

  return saved_method;
end;
$$;

create or replace function public.get_my_wallet_summary()
returns table (
  earned_balance numeric,
  available_balance numeric,
  reserved_withdrawals numeric,
  withdrawn_total numeric,
  provider text,
  phone_number text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  account_role public.user_role;
  is_disabled boolean;
  gross_balance numeric(12,2) := 0;
  available_gross_balance numeric(12,2) := 0;
  reserved_amount numeric(12,2) := 0;
  paid_amount numeric(12,2) := 0;
  saved_method public.withdrawal_methods%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select role, disabled into account_role, is_disabled
  from public.users
  where id = auth.uid();

  if not found then
    raise exception 'Your signed-in account profile was not found. Sign out and back in, then contact support if this continues.';
  end if;
  if is_disabled is true then
    raise exception 'This account is disabled. Ask an administrator to reactivate it before accessing the wallet.';
  end if;
  if account_role is null or account_role not in ('admin', 'vendor') then
    raise exception 'Wallet access requires an admin or vendor profile. The signed-in user ID is %, the profile role is %, and disabled is %.',
      auth.uid(),
      coalesce(account_role::text, 'null'),
      coalesce(is_disabled::text, 'null');
  end if;

  if account_role = 'admin' then
    select coalesce(sum(t.commission_amount), 0)::numeric(12,2)
    into gross_balance
    from public.transactions t
    join public.bookings b on b.id = t.booking_id
    where b.payment_status = 'paid';
    available_gross_balance := gross_balance;
  else
    select coalesce(sum(t.hotel_payout_amount), 0)::numeric(12,2)
    into gross_balance
    from public.transactions t
    join public.bookings b on b.id = t.booking_id
    where t.vendor_id = auth.uid()
      and b.payment_status = 'paid';

    select coalesce(sum(t.hotel_payout_amount), 0)::numeric(12,2)
    into available_gross_balance
    from public.transactions t
    join public.bookings b on b.id = t.booking_id
    where t.vendor_id = auth.uid()
      and t.vendor_payout_status = 'eligible'
      and b.payment_status = 'paid';
  end if;

  select
    coalesce(sum(w.amount) filter (where w.status in ('pending', 'approved')), 0)::numeric(12,2),
    coalesce(sum(w.amount) filter (where w.status = 'paid'), 0)::numeric(12,2)
  into reserved_amount, paid_amount
  from public.withdrawal_requests w
  where w.requester_id = auth.uid();

  select * into saved_method
  from public.withdrawal_methods m
  where m.owner_id = auth.uid();

  return query select
    gross_balance,
    greatest(available_gross_balance - reserved_amount - paid_amount, 0)::numeric(12,2),
    reserved_amount,
    paid_amount,
    saved_method.provider,
    saved_method.phone_number;
end;
$$;

revoke all on function public.save_withdrawal_method(text, text) from public;
grant execute on function public.save_withdrawal_method(text, text) to authenticated;
revoke all on function public.get_my_wallet_summary() from public;
grant execute on function public.get_my_wallet_summary() to authenticated;

notify pgrst, 'reload schema';
