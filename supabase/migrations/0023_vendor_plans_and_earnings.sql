create table if not exists public.vendor_plans (
  id text primary key check (id in ('free', 'pro')),
  name text not null,
  price numeric(12, 2) not null check (price >= 0),
  commission_percent numeric(5, 2) not null check (commission_percent between 0 and 100),
  max_hotels integer not null check (max_hotels > 0),
  features text[] not null default '{}'
);

insert into public.vendor_plans (id, name, price, commission_percent, max_hotels, features)
values
  ('free', 'FREE', 0, 10, 1, array['List 1 hotel', 'Basic support']),
  ('pro', 'PRO', 100, 5, 5, array['List up to 5 hotels', 'Verified badge', 'Lower commission 5%', 'Top search'])
on conflict (id) do update
set name = excluded.name,
    price = excluded.price,
    commission_percent = excluded.commission_percent,
    max_hotels = excluded.max_hotels,
    features = excluded.features;

alter table public.users
  add column if not exists plan_id text not null default 'free',
  add column if not exists pending_plan_id text not null default 'free';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_plan_id_fkey'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_plan_id_fkey
      foreign key (plan_id) references public.vendor_plans(id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'users_pending_plan_id_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_pending_plan_id_check
      check (pending_plan_id in ('free', 'pro'));
  end if;
end;
$$;

create table if not exists public.vendor_plan_payments (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.users(id) on delete cascade,
  plan_id text not null references public.vendor_plans(id),
  amount numeric(12, 2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  provider_reference text not null unique,
  provider_session_id text unique,
  checkout_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendor_plan_payments_vendor_idx
  on public.vendor_plan_payments(vendor_id, created_at desc);

create unique index if not exists vendor_plan_payments_one_pending_per_vendor
  on public.vendor_plan_payments(vendor_id)
  where status = 'pending';

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  vendor_id uuid not null references public.users(id) on delete cascade,
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  total_amount numeric(12, 2) not null check (total_amount >= 0),
  commission_amount numeric(12, 2) not null check (commission_amount >= 0),
  hotel_payout_amount numeric(12, 2) not null check (hotel_payout_amount >= 0),
  status text not null default 'paid',
  created_at timestamptz not null default now()
);

create index if not exists transactions_vendor_created_idx
  on public.transactions(vendor_id, created_at desc);

alter table public.vendor_plans enable row level security;
alter table public.vendor_plan_payments enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "vendor_plans_read_all" on public.vendor_plans;
create policy "vendor_plans_read_all" on public.vendor_plans
for select using (true);

drop policy if exists "vendor_plan_payments_read_own_or_admin" on public.vendor_plan_payments;
create policy "vendor_plan_payments_read_own_or_admin" on public.vendor_plan_payments
for select using (vendor_id = auth.uid() or public.is_admin());

drop policy if exists "transactions_read_vendor_or_admin" on public.transactions;
create policy "transactions_read_vendor_or_admin" on public.transactions
for select using (vendor_id = auth.uid() or public.is_admin());

create or replace function public.sync_vendor_plan_selection_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_user_meta_data->>'role', 'user') = 'vendor' then
    update public.users
    set pending_plan_id = case
      when new.raw_user_meta_data->>'pending_plan_id' = 'pro' then 'pro'
      else 'free'
    end
    where id = new.id and role = 'vendor';
  end if;
  return new;
end;
$$;

drop trigger if exists z_sync_vendor_plan_selection on auth.users;
create trigger z_sync_vendor_plan_selection
after insert on auth.users
for each row
execute function public.sync_vendor_plan_selection_from_auth();

create or replace function public.save_vendor_document(
  p_document_type text,
  p_file_url text
)
returns public.vendor_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_document public.vendor_documents%rowtype;
begin
  if auth.uid() is null or not exists (
    select 1 from public.users
    where id = auth.uid() and role = 'vendor' and disabled = false
  ) then
    raise exception 'An active vendor account is required';
  end if;

  if p_document_type not in ('national_id', 'hotel_document', 'business_document') then
    raise exception 'Invalid vendor document type';
  end if;

  if p_file_url is null or p_file_url not like auth.uid()::text || '/%' then
    raise exception 'Vendor documents must be stored in the vendor account folder';
  end if;

  insert into public.vendor_documents (vendor_id, document_type, file_url, status)
  values (auth.uid(), p_document_type, p_file_url, 'pending')
  on conflict (vendor_id, document_type) do update
    set file_url = excluded.file_url,
        status = 'pending',
        created_at = now()
  returning * into saved_document;

  return saved_document;
end;
$$;

revoke all on function public.save_vendor_document(text, text) from public;
grant execute on function public.save_vendor_document(text, text) to authenticated;

create or replace function public.prevent_vendor_plan_self_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and not public.is_admin()
     and current_setting('app.allow_vendor_plan_change', true) is distinct from 'on'
     and new.plan_id is distinct from old.plan_id then
    new.plan_id := old.plan_id;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_vendor_plan_self_change on public.users;
create trigger prevent_vendor_plan_self_change
before update of plan_id on public.users
for each row
execute function public.prevent_vendor_plan_self_change();

create or replace function public.activate_vendor_plan_after_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    perform set_config('app.allow_vendor_plan_change', 'on', true);
    update public.users
    set plan_id = new.plan_id,
        pending_plan_id = new.plan_id,
        updated_at = now()
    where id = new.vendor_id and role = 'vendor';
    perform set_config('app.allow_vendor_plan_change', 'off', true);
  end if;
  return new;
end;
$$;

drop trigger if exists activate_vendor_plan_after_payment on public.vendor_plan_payments;
create trigger activate_vendor_plan_after_payment
after update of status on public.vendor_plan_payments
for each row
execute function public.activate_vendor_plan_after_payment();

create or replace function public.record_paid_booking_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_vendor_id uuid;
  booking_hotel_id uuid;
  plan_commission numeric(5, 2);
  commission_value numeric(12, 2);
  created_transaction_id uuid;
begin
  if new.payment_status <> 'paid' or old.payment_status = 'paid' then
    return new;
  end if;

  select h.owner_id, h.id, coalesce(vp.commission_percent, 10)
    into booking_vendor_id, booking_hotel_id, plan_commission
  from public.hotels h
  left join public.users u on u.id = h.owner_id and u.role = 'vendor'
  left join public.vendor_plans vp on vp.id = u.plan_id
  where h.id = new.hotel_id;

  if booking_vendor_id is null then
    return new;
  end if;

  commission_value := round(new.total_price * plan_commission / 100, 2);

  insert into public.transactions (
    booking_id,
    vendor_id,
    hotel_id,
    total_amount,
    commission_amount,
    hotel_payout_amount,
    status
  )
  values (
    new.id,
    booking_vendor_id,
    booking_hotel_id,
    new.total_price,
    commission_value,
    new.total_price - commission_value,
    'paid'
  )
  on conflict (booking_id) do nothing
  returning id into created_transaction_id;

  if created_transaction_id is not null then
    insert into public.payouts (
      hotel_id,
      booking_id,
      amount,
      commission,
      hotel_share,
      status,
      method,
      simulated
    )
    values (
      booking_hotel_id,
      new.id,
      new.total_price,
      commission_value,
      new.total_price - commission_value,
      'pending',
      jsonb_build_object('plan_commission_percent', plan_commission, 'manual_demo_payout', true),
      true
    );
  end if;

  return new;
end;
$$;

drop trigger if exists record_paid_booking_transaction on public.bookings;
create trigger record_paid_booking_transaction
after update of payment_status on public.bookings
for each row
execute function public.record_paid_booking_transaction();

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
      new.commission_rate = old.commission_rate;
      new.rejection_reason = old.rejection_reason;
    end if;
    return new;
  end if;

  return new;
end;
$$;

create or replace function public.admin_update_user(
  p_user_id uuid,
  p_role public.user_role default null,
  p_disabled boolean default null,
  p_vendor_status text default null
)
returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_user public.users%rowtype;
  resulting_role public.user_role;
  submitted_document_count integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  select role into resulting_role
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'User not found';
  end if;

  resulting_role := coalesce(p_role, resulting_role);

  if p_vendor_status is not null and p_vendor_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Invalid vendor status';
  end if;

  if p_vendor_status is not null and resulting_role <> 'vendor' then
    raise exception 'Vendor status can only be changed for vendor accounts';
  end if;

  if p_vendor_status = 'approved' then
    select count(distinct document_type) into submitted_document_count
    from public.vendor_documents
    where vendor_id = p_user_id;

    if submitted_document_count < 3 then
      raise exception 'All three verification documents must be submitted before approval';
    end if;
  end if;

  if p_user_id = auth.uid()
    and (coalesce(p_disabled, false) or (p_role is not null and p_role <> 'admin')) then
    raise exception 'You cannot disable or demote your own administrator account';
  end if;

  update public.users
  set role = resulting_role,
      disabled = coalesce(p_disabled, disabled),
      vendor_status = case
        when resulting_role = 'vendor' and p_vendor_status is not null then p_vendor_status
        else vendor_status
      end
  where id = p_user_id
  returning * into updated_user;

  return updated_user;
end;
$$;

drop policy if exists "vendor_documents_select_own_or_admin" on public.vendor_documents;
create policy "vendor_documents_select_own_or_admin" on public.vendor_documents
for select using (vendor_id = auth.uid() or public.is_admin());

drop policy if exists "vendor_documents_insert_own" on public.vendor_documents;
drop policy if exists "vendor_documents_no_client_update_delete" on public.vendor_documents;
drop policy if exists "vendor_documents_no_client_delete" on public.vendor_documents;

drop policy if exists "vendor_documents_own_or_admin" on storage.objects;
create policy "vendor_documents_own_or_admin" on storage.objects
for all using (
  bucket_id = 'vendor-documents'
  and (
    public.is_admin()
    or (
      auth.uid()::text = (storage.foldername(name))[1]
      and public.is_active_user()
      and exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role = 'vendor'
      )
    )
  )
)
with check (
  bucket_id = 'vendor-documents'
  and (
    public.is_admin()
    or (
      auth.uid()::text = (storage.foldername(name))[1]
      and public.is_active_user()
      and exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role = 'vendor'
      )
    )
  )
);

revoke all on function public.admin_update_user(uuid, public.user_role, boolean, text) from public;
grant execute on function public.admin_update_user(uuid, public.user_role, boolean, text) to authenticated;
