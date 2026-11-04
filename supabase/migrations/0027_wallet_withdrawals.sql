create table if not exists public.withdrawal_methods (
  owner_id uuid primary key references public.users(id) on delete cascade,
  provider text not null check (provider in ('orange_money', 'afri_money')),
  phone_number text not null check (phone_number ~ '^[+]?[0-9][0-9 -]{6,19}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.users(id) on delete cascade,
  requester_role public.user_role not null check (requester_role in ('admin', 'vendor')),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'SLE' check (currency = 'SLE'),
  provider text not null check (provider in ('orange_money', 'afri_money')),
  phone_number text not null check (phone_number ~ '^[+]?[0-9][0-9 -]{6,19}$'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'rejected')),
  admin_note text,
  reviewed_by uuid references public.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists withdrawal_requests_owner_idx
  on public.withdrawal_requests(requester_id, requested_at desc);
create index if not exists withdrawal_requests_status_idx
  on public.withdrawal_requests(status, requested_at desc);

alter table public.withdrawal_methods enable row level security;
alter table public.withdrawal_requests enable row level security;

drop policy if exists "withdrawal_methods_read_own_or_admin" on public.withdrawal_methods;
create policy "withdrawal_methods_read_own_or_admin" on public.withdrawal_methods
for select using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "withdrawal_requests_read_own_or_admin" on public.withdrawal_requests;
create policy "withdrawal_requests_read_own_or_admin" on public.withdrawal_requests
for select using (requester_id = auth.uid() or public.is_admin());

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
  current_role public.user_role;
  is_disabled boolean;
  saved_method public.withdrawal_methods%rowtype;
  normalized_phone text := trim(p_phone_number);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select role, disabled into current_role, is_disabled
  from public.users where id = auth.uid();
  if current_role is null or current_role not in ('admin', 'vendor') or is_disabled is distinct from false then
    raise exception 'An active admin or vendor account is required';
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
  current_role public.user_role;
  gross_balance numeric(12,2) := 0;
  reserved_amount numeric(12,2) := 0;
  paid_amount numeric(12,2) := 0;
  saved_method public.withdrawal_methods%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select role into current_role from public.users
  where id = auth.uid() and disabled = false;
  if current_role is null or current_role not in ('admin', 'vendor') then
    raise exception 'An active admin or vendor account is required';
  end if;

  if current_role = 'admin' then
    select coalesce(sum(t.commission_amount), 0)::numeric(12,2)
    into gross_balance from public.transactions t;
  else
    select coalesce(sum(t.hotel_payout_amount), 0)::numeric(12,2)
    into gross_balance
    from public.transactions t
    where t.vendor_id = auth.uid() and t.vendor_payout_status = 'eligible';
  end if;

  select coalesce(sum(w.amount) filter (where w.status in ('pending', 'approved')), 0)::numeric(12,2),
         coalesce(sum(w.amount) filter (where w.status = 'paid'), 0)::numeric(12,2)
  into reserved_amount, paid_amount
  from public.withdrawal_requests w
  where w.requester_id = auth.uid();

  select * into saved_method from public.withdrawal_methods m where m.owner_id = auth.uid();

  return query select
    gross_balance,
    greatest(gross_balance - reserved_amount - paid_amount, 0)::numeric(12,2),
    reserved_amount,
    paid_amount,
    saved_method.provider,
    saved_method.phone_number;
end;
$$;

create or replace function public.request_withdrawal(p_amount numeric)
returns public.withdrawal_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  current_role public.user_role;
  is_disabled boolean;
  saved_method public.withdrawal_methods%rowtype;
  available_amount numeric(12,2);
  new_request public.withdrawal_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select role, disabled into current_role, is_disabled
  from public.users where id = auth.uid() for update;
  if current_role is null or current_role not in ('admin', 'vendor') or is_disabled is distinct from false then
    raise exception 'An active admin or vendor account is required';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Enter a withdrawal amount greater than zero with no more than two decimal places';
  end if;

  select * into saved_method from public.withdrawal_methods m where m.owner_id = auth.uid();
  if not found then
    raise exception 'Add a withdrawal method before requesting a withdrawal';
  end if;
  select wallet.available_balance into available_amount
  from public.get_my_wallet_summary() wallet;
  if p_amount > available_amount then
    raise exception 'Withdrawal amount exceeds your available balance';
  end if;

  insert into public.withdrawal_requests (
    requester_id, requester_role, amount, provider, phone_number, status
  ) values (
    auth.uid(), current_role, p_amount, saved_method.provider, saved_method.phone_number, 'pending'
  ) returning * into new_request;
  return new_request;
end;
$$;

create or replace function public.admin_review_withdrawal(
  p_request_id uuid,
  p_status text,
  p_admin_note text default null
)
returns public.withdrawal_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  current_request public.withdrawal_requests%rowtype;
  saved_request public.withdrawal_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required';
  end if;
  if p_status not in ('approved', 'paid', 'rejected') then
    raise exception 'Choose approve, mark paid, or reject';
  end if;
  select * into current_request from public.withdrawal_requests
  where id = p_request_id for update;
  if not found then
    raise exception 'Withdrawal request not found';
  end if;
  if p_status = 'approved' or p_status = 'rejected' then
    if current_request.status <> 'pending' then
      raise exception 'Only pending withdrawal requests can be approved or rejected';
    end if;
  elsif current_request.status <> 'approved' then
    raise exception 'Only approved withdrawal requests can be marked paid';
  end if;

  update public.withdrawal_requests
  set status = p_status,
      admin_note = coalesce(nullif(trim(p_admin_note), ''), admin_note),
      reviewed_by = auth.uid(),
      reviewed_at = case when p_status in ('approved', 'rejected') then now() else reviewed_at end,
      paid_at = case when p_status = 'paid' then now() else paid_at end,
      updated_at = now()
  where id = p_request_id
  returning * into saved_request;

  return saved_request;
end;
$$;

revoke all on function public.save_withdrawal_method(text, text) from public;
revoke all on function public.get_my_wallet_summary() from public;
revoke all on function public.request_withdrawal(numeric) from public;
revoke all on function public.admin_review_withdrawal(uuid, text, text) from public;
grant execute on function public.save_withdrawal_method(text, text) to authenticated;
grant execute on function public.get_my_wallet_summary() to authenticated;
grant execute on function public.request_withdrawal(numeric) to authenticated;
grant execute on function public.admin_review_withdrawal(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
