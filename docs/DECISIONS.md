# Project decisions

- 2026-10-02: Matched the Expo documentation reference to the installed SDK version in `package.json` (`Expo SDK 57`).
- 2026-10-02: Fixed the invalid Android/iOS bundle IDs to the valid reverse-DNS value `com.trench.hotelmanagement`.
- 2026-10-02: Removed hard-coded secret and backend values from `app.json` and moved them to `app.config.ts` using `EXPO_PUBLIC_*` environment variables.
- 2026-10-02: Added the missing repo hygiene rules for `.env`, `server/.env`, and generated build folders to `.gitignore`.
- 2026-10-03: Added vendor approval gating to the root routing so pending/rejected vendors are redirected to the approval screen instead of the vendor dashboard.
- 2026-10-03: Kept role creation safe by constraining sign-up metadata to `'user'` or `'vendor'` and leaving admin elevation to trusted database-side SQL.
- 2026-10-03: Booking creation now initializes payment via the Node backend using the server-side amount flow instead of trusting a client-supplied price and status.
- 2026-10-03: Local notifications use a backend fallback so the demo stays functional without a live Supabase session during early development.
- 2026-10-03: Admin hotel moderation and user/vendor account changes use SECURITY DEFINER RPCs that verify the active administrator role; client screens do not receive elevated database credentials.
- 2026-10-03: Admin reports aggregate only rows visible through the signed-in administrator's RLS context, and CSV export is initiated by the web UI without accessing browser globals during static rendering.
- 2026-10-03: Admin-disabled accounts are routed to a sign-out screen, and the Phase 5 migration additionally blocks disabled users from user-owned writes and uploads through RLS.
