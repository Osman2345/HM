alter table public.payments
  add column if not exists provider_session_id text;

create unique index if not exists payments_provider_session_id_uidx
  on public.payments(provider_session_id)
  where provider_session_id is not null;
