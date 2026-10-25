alter table public.hotels
  add column if not exists review_count integer not null default 0;

update public.hotels h
set review_count = (
  select count(*)::integer
  from public.reviews r
  where r.hotel_id = h.id
);

alter table public.hotels
  alter column review_count set default 0,
  alter column review_count set not null;
