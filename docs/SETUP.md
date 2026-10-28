# Supabase setup guide

## 1. Run the migrations in order

Open the Supabase SQL editor and run every SQL file in `supabase/migrations`
in numeric order. Run `supabase/seed.sql` after all migrations.

These files are idempotent and safe to rerun as part of a fresh environment rebuild.
Vendor accounts start as pending until an administrator approves or rejects them.
Migrations `0022` and `0023` enable National ID/passport, hotel, and business
document uploads, the FREE/PRO plan records, and earnings tracking.
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
```

## 6. Environment variables

Use the app `.env` file to populate:

```env
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
EXPO_PUBLIC_GOOGLE_MAPS_EMBED_KEY=<optional>
EXPO_PUBLIC_BACKEND_URL=http://localhost:3000
```

Keep the backend running with `npm run server` when using account or payment
features. `localhost` works in a browser on the development computer; for a
physical phone, set `EXPO_PUBLIC_BACKEND_URL` to the computer's LAN IP address
(for example `http://192.168.1.10:3000`), allow port 3000 through its firewall,
and restart Expo.

Configure Monime credentials and the Supabase service-role key in `server/.env`
only. Never put these secrets in the mobile app or a public Expo environment
variable.

## 7. Configure password reset links

In Supabase Auth > URL Configuration, add the app's reset callback to the
Redirect URLs allow list. Native builds use `hotelmanagement://reset-password`.
For web, add the absolute URL for the deployed app's `/reset-password` route and
the local web URL used during development (for example,
`http://localhost:8081/reset-password`). The redirect URL must match the app
environment where the reset link will be opened.
