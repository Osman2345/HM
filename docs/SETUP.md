# Supabase setup guide

## 1. Run the migrations in order

Open the Supabase SQL editor and run every SQL file in `supabase/migrations`
in numeric order. Run `supabase/seed.sql` after all migrations.

These files are idempotent and safe to rerun as part of a fresh environment rebuild.
Vendor accounts start as pending until an administrator approves or rejects them.
Migration `0022` enables National ID/passport, hotel, and business document
uploads. Migrations `0023` through `0026` are historical plan and commission
schema steps; migration `0030` removes vendor plans and hotel-count limits,
leaving one platform-wide commission for all vendors. Migrations `0025` and
`0026` add Pay-at-Hotel booking controls,
voucher/no-show tracking, and the replacement platform-wide commission system.
Migration `0027` adds the vendor/admin wallet, mobile-money withdrawal methods,
withdrawal requests, and admin review actions. A vendor's available balance
includes paid bookings only after checkout; withdrawal requests stay reserved
until rejected or paid.
Migration `0028` repairs any nullable account-disabled flags and improves the
withdrawal-method account checks with actionable errors.
Migration `0029` fixes wallet role detection by avoiding PostgreSQL's
`CURRENT_ROLE` keyword collision in the withdrawal RPCs.
Migration `0031` adds the booking test marker and service-only RPC used to
record a Monime test payment and let the existing transaction trigger create
simulated commission and vendor earnings without a webhook.
The default commission is 15%; admins can change percentage rates from 5% to
30% or select a fixed SLE charge under Admin > Settings. The commission policy
PDF is available during vendor signup and does not depend on database access to
generate. Currency is SLE-only
until USD checkout or an exchange-rate source is configured. New paid bookings
write one commission/payout record to `transactions`; historical `payouts`
rows are retained but are no longer duplicated for new bookings.
Once approved, vendors can publish properties immediately; property listings do
not wait for a separate approval.

## 2. Create the storage buckets

Create the following buckets in the Project settings > Storage dashboard:

- `hotel-images` (public)
- `profile-images` (public)
- `vendor-documents` (private)

Use the folder pattern `uid/...` for user-owned uploads.

## 3. Create the initial admin user

Create a first admin directly in Supabase Auth, then update the `public.users` row with:

```sql
update public.users
set role = 'admin'
where email = 'admin@hotelportal.local';
```

The `handle_new_user` trigger will prevent clients from creating themselves as admin. Only a trusted admin or database migration may promote a user to admin.

## 4. Toggle email confirmation

If you want new signups to require email confirmation, enable the setting in Supabase Auth > Settings. If you want local testing without email confirmation, disable it while developing.

## 5. Verify the schema

Run the following sanity checks after the SQL migration:

```sql
select * from public.users;
select * from public.hotels where approval_status = 'approved';
select * from public.bookings;
select * from public.payouts;
select * from public.platform_settings;
select * from public.transactions;
```

## 6. Environment variables

Use the app `.env` file to populate:

```env
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
EXPO_PUBLIC_GOOGLE_MAPS_EMBED_KEY=<optional>
EXPO_PUBLIC_BACKEND_URL=
```

Keep the backend running with `npm run server` when using account or payment
features. During Expo LAN development, the app uses the current Expo host to
reach the backend on port 3000, including from a physical phone. If the backend
runs on another computer or you use a custom host, set
`EXPO_PUBLIC_BACKEND_URL` to that server's reachable address (for example
`http://192.168.1.10:3000`), allow port 3000 through its firewall, and restart
Expo.

Configure Monime credentials and the Supabase secret key in `server/.env` only.
The key must be enabled for the same project as `SUPABASE_URL`. Set
`SUPABASE_SECRET_KEY` to the project's `sb_secret_...` key (or keep the
legacy `SUPABASE_SERVICE_ROLE_KEY` variable for an existing service-role JWT).
Set `SUPABASE_ANON_KEY` there for backend user-token verification; during local
development, the backend can also read `EXPO_PUBLIC_SUPABASE_ANON_KEY` from the
project-root `.env`. The backend uses the anon key to verify signed-in users and
the secret key only for privileged database operations. If Supabase reports an
unregistered API key, verify the key is copied from the same project's
Dashboard > Settings > API Keys and restart the backend. Never put secret keys
in the mobile app or a public Expo environment variable.

Set `MONIME_MODE=TEST` with a `mon_test_` token for demo payments, or
`MONIME_MODE=LIVE` with Live credentials. A TEST token does not call Monime:
the app simulates a Le 1 payment using the TEST PIN `1234`, records it as
pending, and moves no money. Vendor earnings remain pending until an
administrator releases the TEST funds. Live credentials continue to use
Monime checkout and its configured return URL and webhook.

For Monime payments, set `PAYMENT_CALLBACK_URL` in `server/.env` to
`https://<your-public-backend-host>/api/payments/return`. This public HTTPS
endpoint redirects Safari back into the app after checkout. Also register
`https://<your-public-backend-host>/api/payments/monime-webhook` in Monime and
subscribe it to checkout completed, cancelled, and expired events for Live
mode; the signed webhook updates the payment record even if the customer does
not return to the app.

## 7. Configure password reset links

In Supabase Auth > URL Configuration, add the app's reset callback to the
Redirect URLs allow list. Native builds use `hotelmanagement://reset-password`.
For web, add the absolute URL for the deployed app's `/reset-password` route and
the local web URL used during development (for example,
`http://localhost:8081/reset-password`). The redirect URL must match the app
environment where the reset link will be opened.
