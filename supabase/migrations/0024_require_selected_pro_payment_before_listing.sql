create or replace function public.require_selected_pro_payment_before_hotel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_plan text;
  active_plan text;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  select pending_plan_id, plan_id
    into selected_plan, active_plan
  from public.users
  where id = auth.uid()
    and role = 'vendor'
    and vendor_status = 'approved'
    and disabled = false;

  if found and selected_plan = 'pro' and active_plan <> 'pro' then
    raise exception 'Complete the one-time Le 100 PRO payment before creating a hotel listing';
  end if;

  return new;
end;
$$;

drop trigger if exists a_require_selected_pro_payment_before_hotel on public.hotels;
create trigger a_require_selected_pro_payment_before_hotel
before insert on public.hotels
for each row
execute function public.require_selected_pro_payment_before_hotel();

revoke all on function public.require_selected_pro_payment_before_hotel() from public;
