alter table public.hotels
  add column if not exists rejection_reason text;
