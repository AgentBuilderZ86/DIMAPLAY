# CLAUDE.md — Dima Play

iOS-first (Android later, same codebase) app for amateur sport in Morocco: 5-a-side football, padel, tennis.
Players organise matches, film them, mark highlights live, get vertical clips, and update a player card plus
neighbourhood / city / Morocco rankings. v1 = real data only (no mocks in production), shipped via TestFlight → App Store.

## Stack
Expo (latest stable) + TypeScript strict + Expo Router · EAS Build/Submit (`development`, `preview`, `production`) ·
Supabase (Auth, Postgres + RLS on every table, Storage, Realtime, Edge Functions; local via Supabase CLI) ·
Sign in with Apple + phone OTP only · react-native-vision-camera · expo-image-picker · resumable upload (tus) ·
`VideoProvider` abstraction (managed provider, ffmpeg worker fallback) · RevenueCat · expo-notifications ·
TanStack Query + Zustand · Jest + RNTL, SQL RLS tests, Maestro e2e · ESLint, Prettier, GitHub Actions · Sentry (no PII).

## Conventions
- Code, identifiers, commits in English. UI strings in French by default (darija touches), AR (RTL) and EN via i18n.
  No hard-coded user-facing text outside translation files. Currency MAD, displayed "DH".
- No secrets in code: `.env` (gitignored) + `app.config.ts`; keep `.env.example` documented.
- Every table has RLS; every RLS rule has a SQL test. Entitlements are enforced server-side.
- Design tokens only (no raw hex in components): turf #0F4D32, turf2 #17683F, chalk #F5F7F2, court #2747C9,
  clay #A84A2B, flood #F2D13D, ink #14201A; dark mode via tokens. Fonts: Big Shoulders Display (numbers/titles),
  Instrument Sans (text). Touch targets ≥ 44pt, dynamic type, VoiceOver, AA contrast, honour reduce-motion.
- No facial recognition / biometrics. Players tag themselves in moments.
- Check current docs (Expo, Supabase, RevenueCat, video provider, Apple rules) before each integration.

## Workflow
- One milestone = one branch, green tests, clean commit, short report (done / left / risks). Don't start Mx+1 until Mx acceptance passes.
- Act freely on local reversible work. Ask once (with everything prepared) before: creating paid accounts/projects, adding keys,
  pushing to remotes, EAS builds, TestFlight, App Store submission. Always ask before irreversible actions (remote data deletion, destructive migrations).

## Commands (to be filled as M0 lands)
`npm test` · `npm run typecheck` · `npm run lint` · `npx supabase start` · `npx supabase db reset` · `npx maestro test e2e/`

## Layout (target)
`app/` routes · `src/{components,features,lib,i18n,theme}` · `supabase/{migrations,functions,tests}` · `worker/` (optional ffmpeg) · `e2e/` · `docs/`
