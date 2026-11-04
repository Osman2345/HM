alter type public.payment_status add value if not exists 'reserved_not_paid';

notify pgrst, 'reload schema';
