alter table public.bookings
  add column if not exists updated_at timestamptz not null default now();

notify pgrst, 'reload schema';
