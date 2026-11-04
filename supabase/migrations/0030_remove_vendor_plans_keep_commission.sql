drop trigger if exists z_sync_vendor_plan_selection on auth.users;
drop function if exists public.sync_vendor_plan_selection_from_auth();

drop trigger if exists prevent_vendor_plan_self_change on public.users;
drop function if exists public.prevent_vendor_plan_self_change();

drop trigger if exists activate_vendor_plan_after_payment on public.vendor_plan_payments;
drop function if exists public.activate_vendor_plan_after_payment();

drop trigger if exists a_require_selected_pro_payment_before_hotel on public.hotels;
drop function if exists public.require_selected_pro_payment_before_hotel();

create or replace function public.restrict_hotel_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_vendor_id uuid;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null then
      raise exception 'Authentication required';
    end if;

    if not public.is_admin() then
      select u.id into active_vendor_id
      from public.users u
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
      new.rejection_reason = old.rejection_reason;
    end if;
    return new;
  end if;

  return new;
end;
$$;

alter table public.users
  drop constraint if exists users_plan_id_fkey,
  drop constraint if exists users_pending_plan_id_check,
  drop column if exists plan_id,
  drop column if exists pending_plan_id;

drop table if exists public.vendor_plan_payments;
drop table if exists public.vendor_plans;

notify pgrst, 'reload schema';
