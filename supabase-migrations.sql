-- Add vendor support to the existing schema safely.
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'vendor';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS vendor_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS business_description text,
  ADD COLUMN IF NOT EXISTS business_logo text,
  ADD COLUMN IF NOT EXISTS business_document_url text;

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS price_range text,
  ADD COLUMN IF NOT EXISTS approval_status text,
  ADD COLUMN IF NOT EXISTS cover_image text,
  ADD COLUMN IF NOT EXISTS policies text,
  ADD COLUMN IF NOT EXISTS check_in_time text,
  ADD COLUMN IF NOT EXISTS check_out_time text,
  ADD COLUMN IF NOT EXISTS rooms jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.hotels SET approval_status = 'approved' WHERE approval_status IS NULL;
ALTER TABLE public.hotels ALTER COLUMN approval_status SET NOT NULL;
ALTER TABLE public.hotels ALTER COLUMN approval_status SET DEFAULT 'pending';

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (
    id,
    fullname,
    email,
    role,
    vendor_status,
    business_name,
    business_description,
    business_document_url
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'fullname', SPLIT_PART(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')::public.user_role,
    COALESCE(NEW.raw_user_meta_data->>'vendor_status', 'approved'),
    NEW.raw_user_meta_data->>'business_name',
    NEW.raw_user_meta_data->>'business_description',
    NEW.raw_user_meta_data->>'business_document_url'
  );
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "hotels public read" ON public.hotels;
DROP POLICY IF EXISTS "hotels owner manage" ON public.hotels;

CREATE POLICY "hotels public read" ON public.hotels FOR SELECT USING (
  approval_status = 'approved' OR owner_id = auth.uid() OR public.is_admin()
);
CREATE POLICY "hotels owner manage" ON public.hotels FOR ALL USING (
  owner_id = auth.uid() OR public.is_admin()
) WITH CHECK (
  owner_id = auth.uid() OR public.is_admin()
);

DROP POLICY IF EXISTS "bookings read own or admin" ON public.bookings;
CREATE POLICY "bookings read own or admin" ON public.bookings FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin() OR EXISTS(
    SELECT 1 FROM public.hotels h WHERE h.id = hotel_id AND h.owner_id = auth.uid()
  )
);
DROP POLICY IF EXISTS "bookings update own or admin" ON public.bookings;
DROP POLICY IF EXISTS "bookings update own or vendor or admin" ON public.bookings;
CREATE POLICY "bookings update own or vendor or admin" ON public.bookings FOR UPDATE USING (
  user_id = auth.uid() OR public.is_admin() OR EXISTS(
    SELECT 1 FROM public.hotels h WHERE h.id = hotel_id AND h.owner_id = auth.uid()
  )
) WITH CHECK (
  user_id = auth.uid() OR public.is_admin() OR EXISTS(
    SELECT 1 FROM public.hotels h WHERE h.id = hotel_id AND h.owner_id = auth.uid()
  )
);
DROP POLICY IF EXISTS "bookings delete own or admin" ON public.bookings;
CREATE POLICY "bookings delete own or admin" ON public.bookings FOR DELETE USING (
  user_id = auth.uid() OR public.is_admin()
);

DROP POLICY IF EXISTS "payments read own or admin" ON public.payments;
CREATE POLICY "payments read own or admin" ON public.payments FOR SELECT USING (
  public.is_admin() OR EXISTS(
    SELECT 1 FROM public.bookings b
    JOIN public.hotels h ON h.id = b.hotel_id
    WHERE b.id = booking_id AND (b.user_id = auth.uid() OR h.owner_id = auth.uid())
  )
);

CREATE INDEX IF NOT EXISTS hotels_owner_idx ON public.hotels(owner_id);
CREATE INDEX IF NOT EXISTS hotels_approval_status_idx ON public.hotels(approval_status);

-- Add payout fields and payouts table
ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS payout_method jsonb;
ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS commission_rate numeric(5,2) NOT NULL DEFAULT 0.00;

CREATE TABLE IF NOT EXISTS public.payouts (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid references public.hotels(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  commission numeric(12,2) not null default 0.00,
  hotel_share numeric(12,2) not null default 0.00,
  status text not null default 'simulated',
  method jsonb,
  simulated boolean not null default true,
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS payouts_hotel_idx ON public.payouts(hotel_id);

-- webhook logs to persist raw events for replay/debug
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id uuid primary key default gen_random_uuid(),
  event_id text,
  event_name text,
  payload jsonb,
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS webhook_logs_event_idx ON public.webhook_logs(event_id);

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null unique,
  platform text not null,
  updated_at timestamptz not null default now()
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "push tokens own" ON public.push_tokens;
CREATE POLICY "push tokens own" ON public.push_tokens FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_booking_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hotel_owner uuid;
BEGIN
  SELECT owner_id INTO hotel_owner FROM public.hotels WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.hotel_id ELSE NEW.hotel_id END;

  IF TG_OP = 'INSERT' AND hotel_owner IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message)
    VALUES (hotel_owner, 'New booking request', 'A guest has requested a booking for your hotel.');
  ELSIF TG_OP = 'DELETE' AND hotel_owner IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message)
    VALUES (hotel_owner, 'Booking deleted', 'A guest deleted a booking for your hotel.');
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.booking_status IS DISTINCT FROM NEW.booking_status THEN
      INSERT INTO public.notifications (user_id, title, message)
      VALUES (
        NEW.user_id,
        CASE NEW.booking_status
          WHEN 'confirmed' THEN 'Booking confirmed'
          WHEN 'cancelled' THEN 'Booking cancelled'
          ELSE 'Booking status updated'
        END,
        CASE NEW.booking_status
          WHEN 'confirmed' THEN 'The hotel confirmed your booking. You can now complete payment.'
          WHEN 'cancelled' THEN 'The hotel cancelled your booking.'
          ELSE 'Your booking status has changed.'
        END
      );
    END IF;
    IF OLD.payment_status IS DISTINCT FROM NEW.payment_status AND NEW.payment_status = 'paid' THEN
      INSERT INTO public.notifications (user_id, title, message)
      VALUES (NEW.user_id, 'Payment received', 'Your booking payment was received successfully.');
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS booking_notification_events ON public.bookings;
CREATE TRIGGER booking_notification_events
AFTER INSERT OR UPDATE OF booking_status, payment_status OR DELETE ON public.bookings
FOR EACH ROW EXECUTE PROCEDURE public.notify_booking_events();
