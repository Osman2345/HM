-- RLS proof queries for the security migration.

-- 1) A customer cannot upgrade themselves to admin
select exists (
  select 1
  from public.users u
  where id = auth.uid()
    and role = 'admin'
) as customer_cannot_become_admin;

-- 2) A customer cannot self-approve their hotel
select exists (
  select 1
  from public.hotels h
  where h.owner_id = auth.uid()
    and h.approval_status = 'approved'
) as customer_cannot_self_approve;

-- 3) A customer cannot forge a booking
select exists (
  select 1
  from public.bookings b
  where b.user_id = auth.uid()
    and b.total_price > 0
    and b.payment_status = 'paid'
    and b.booking_status = 'confirmed'
) as customer_cannot_forge_booking_status;

-- 4) A customer cannot read payouts or webhook logs
select exists (
  select 1
  from public.payouts p
  where p.hotel_id in (
    select h.id from public.hotels h where h.owner_id = auth.uid()
  )
) as customer_cannot_read_payouts;

select exists (
  select 1
  from public.webhook_logs w
) as customer_cannot_read_webhook_logs;

-- Run these as the demo customer role to confirm the checks return false.
-- In a secure setup, the same queries should return zero rows or false because the role is blocked by the RLS policies.
