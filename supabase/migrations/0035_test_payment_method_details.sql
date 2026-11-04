alter table public.payments
  add column if not exists test_payment_method text,
  add column if not exists test_phone_number text;

alter table public.payments
  drop constraint if exists payments_test_payment_method_check,
  add constraint payments_test_payment_method_check
    check (test_payment_method is null or test_payment_method in ('orange', 'afri'));

notify pgrst, 'reload schema';
