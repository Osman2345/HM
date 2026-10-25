alter table public.hotels
  add column if not exists price_per_night numeric(12,2);

update public.hotels
set price_per_night = coalesce((
  select min((room->>'price_per_night')::numeric(12,2))
  from jsonb_array_elements(rooms) as room
), 0)
where price_per_night is null;

alter table public.hotels
  alter column price_per_night set default 0,
  alter column price_per_night set not null;
