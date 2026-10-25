create or replace function public.restrict_hotel_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null then
      raise exception 'Authentication required';
    end if;

    if not public.is_admin() then
      if not exists (
        select 1
        from public.users u
        where u.id = auth.uid()
          and u.role = 'vendor'
          and u.vendor_status = 'approved'
          and u.disabled = false
      ) then
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
      new.commission_rate = old.commission_rate;
      new.rejection_reason = old.rejection_reason;
    end if;

    return new;
  end if;

  return new;
end;
$$;

update public.hotels h
set approval_status = 'approved',
    rejection_reason = null
from public.users u
where h.owner_id = u.id
  and u.role = 'vendor'
  and u.vendor_status = 'approved'
  and u.disabled = false
  and h.approval_status = 'pending';
