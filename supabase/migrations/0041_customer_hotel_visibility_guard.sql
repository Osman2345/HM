drop policy if exists "hotels_customer_visibility_guard" on public.hotels;
create policy "hotels_customer_visibility_guard" on public.hotels
as restrictive
for select using (
  owner_id = auth.uid()
  or public.is_admin()
  or (
    approval_status = 'approved'
    and not public.vendor_has_commission_booking_hold(owner_id)
  )
);
