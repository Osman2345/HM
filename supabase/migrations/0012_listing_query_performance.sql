create extension if not exists pg_trgm with schema extensions;

create index if not exists hotels_name_trgm_idx
  on public.hotels using gin (name extensions.gin_trgm_ops);

create index if not exists hotels_city_trgm_idx
  on public.hotels using gin (city extensions.gin_trgm_ops);

create index if not exists hotels_description_trgm_idx
  on public.hotels using gin (description extensions.gin_trgm_ops);

create index if not exists favorites_user_hotel_idx
  on public.favorites(user_id, hotel_id);
