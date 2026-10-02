# M1 setup checklist (needs your accounts — nothing here has been created for you)

1. **Supabase project** (region: EU recommended; the choice feeds the CNDP transfer file in `docs/DATA_MAP.md`).
   - `npx supabase link --project-ref <ref>` then `npx supabase db push` (applies `supabase/migrations`).
   - `npx supabase functions deploy delete-account`.
   - Put the project URL and anon key in `.env` (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`).
2. **Auth providers** (Dashboard > Authentication > Providers)
   - Apple: enable; Client IDs = the iOS bundle id (`ma.dimaplay.app` unless you change it) and
     `host.exp.Exponent` for Expo Go tests. Native flow needs no OAuth secret.
   - Phone: enable and connect an SMS provider (Twilio, MessageBird, Vonage or TextLocal). Check
     deliverability to Moroccan operators (Maroc Telecom, Orange, inwi) before the pilot.
   - Email provider: keep disabled (v1 = Apple + phone only).
3. **Apple Developer**: App ID with _Sign in with Apple_ capability for the bundle id.
4. **Legal links** (`EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_SUPPORT_EMAIL`):
   the Settings rows only appear when set; they must all be set before App Store submission.
5. **Test numbers** `212600000001` / `212600000002` (code `123456`) exist only in the local
   `supabase/config.toml`; never add test OTPs to a hosted project.

## Deletion and the 30-day rule

`delete-account` removes the auth user, which cascades to `profiles` and `consents` immediately.
Backups age out within the provider's retention window; keep it <= 30 days (see `docs/DATA_MAP.md`
in M8). Videos/clips are erased by the same function once they exist (M3).

## Open decisions

- Minimum age is 13 (`MIN_AGE_YEARS`); anyone whose birth-year difference is <= 18 is a minor.
- Parental consent collection/verification is built in M5; until then minors get strict privacy
  defaults (not in public views, not in recruiter showcase).
