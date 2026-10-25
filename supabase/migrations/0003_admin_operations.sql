create or replace function public.admin_review_hotel(
  p_hotel_id uuid,
  p_status text default null,
  p_rejection_reason text default null,
  p_featured boolean default null
)
returns public.hotels
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_hotel public.hotels%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  if p_status is not null and p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Invalid hotel approval status';
  end if;

  if p_status = 'rejected' and nullif(trim(p_rejection_reason), '') is null then
    raise exception 'A rejection reason is required';
  end if;

  update public.hotels
  set approval_status = coalesce(p_status, approval_status),
      rejection_reason = case
        when p_status = 'rejected' then trim(p_rejection_reason)
        when p_status = 'approved' or p_status = 'pending' then null
        else rejection_reason
      end,
      featured = case
        when p_status = 'rejected' then false
        when p_featured is not null then p_featured
        else featured
      end
  where id = p_hotel_id
  returning * into updated_hotel;

  if not found then
    raise exception 'Hotel not found';
  end if;

  if updated_hotel.approval_status <> 'approved' and p_featured = true then
    raise exception 'Only approved hotels can be featured';
  end if;

  return updated_hotel;
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

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and disabled = false
  );
$$;

drop policy if exists "users_update_own_or_admin" on public.users;
create policy "users_update_own_or_admin" on public.users
for update using ((id = auth.uid() and public.is_active_user()) or public.is_admin())
with check ((id = auth.uid() and public.is_active_user()) or public.is_admin());

drop policy if exists "hotels_owner_or_admin_write" on public.hotels;
create policy "hotels_owner_or_admin_write" on public.hotels
for all using ((owner_id = auth.uid() and public.is_active_user()) or public.is_admin())
with check ((owner_id = auth.uid() and public.is_active_user()) or public.is_admin());

drop policy if exists "bookings_delete_own_or_admin" on public.bookings;
create policy "bookings_delete_own_or_admin" on public.bookings
for delete using ((user_id = auth.uid() and public.is_active_user()) or public.is_admin());

drop policy if exists "favorites_manage_own" on public.favorites;
create policy "favorites_manage_own" on public.favorites
for all using (user_id = auth.uid() and public.is_active_user())
with check (user_id = auth.uid() and public.is_active_user());

drop policy if exists "reviews_manage_own_or_admin" on public.reviews;
create policy "reviews_manage_own_or_admin" on public.reviews
for all using ((user_id = auth.uid() and public.is_active_user()) or public.is_admin())
with check ((user_id = auth.uid() and public.is_active_user()) or public.is_admin());

drop policy if exists "notifications_manage_own_or_admin" on public.notifications;
create policy "notifications_manage_own_or_admin" on public.notifications
for all using ((user_id = auth.uid() and public.is_active_user()) or public.is_admin())
with check ((user_id = auth.uid() and public.is_active_user()) or public.is_admin());

drop policy if exists "push_tokens_manage_own" on public.push_tokens;
create policy "push_tokens_manage_own" on public.push_tokens
for all using (user_id = auth.uid() and public.is_active_user())
with check (user_id = auth.uid() and public.is_active_user());

drop policy if exists "hotel_images_owner_or_admin_write" on storage.objects;
create policy "hotel_images_owner_or_admin_write" on storage.objects
for all using (
  bucket_id = 'hotel-images'
  and (
    public.is_admin()
    or (
      auth.uid()::text = (storage.foldername(name))[1]
      and public.is_active_user()
      and exists (
        select 1
        from public.users u
        where u.id = auth.uid()
          and u.role = 'vendor'
          and u.vendor_status = 'approved'
      )
    )
  )
)
with check (
  bucket_id = 'hotel-images'
  and (
    public.is_admin()
    or (
      auth.uid()::text = (storage.foldername(name))[1]
      and public.is_active_user()
      and exists (
        select 1
        from public.users u
        where u.id = auth.uid()
          and u.role = 'vendor'
          and u.vendor_status = 'approved'
      )
    )
  )
);

drop policy if exists "profile_images_own_write" on storage.objects;
create policy "profile_images_own_write" on storage.objects
for all using (
  bucket_id = 'profile-images' and auth.uid()::text = (storage.foldername(name))[1] and public.is_active_user()
)
with check (
  bucket_id = 'profile-images' and auth.uid()::text = (storage.foldername(name))[1] and public.is_active_user()
);

drop policy if exists "vendor_documents_own_or_admin" on storage.objects;
create policy "vendor_documents_own_or_admin" on storage.objects
for all using (
  bucket_id = 'vendor-documents' and (
    public.is_admin() or (
      auth.uid()::text = (storage.foldername(name))[1] and public.is_active_user()
    )
  )
)
with check (
  bucket_id = 'vendor-documents' and (
    public.is_admin() or (
      auth.uid()::text = (storage.foldername(name))[1] and public.is_active_user()
    )
  )
);

revoke all on function public.admin_review_hotel(uuid, text, text, boolean) from public;
grant execute on function public.admin_review_hotel(uuid, text, text, boolean) to authenticated;

revoke all on function public.admin_update_user(uuid, public.user_role, boolean, text) from public;
grant execute on function public.admin_update_user(uuid, public.user_role, boolean, text) to authenticated;
