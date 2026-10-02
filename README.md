# Dima Play

iOS-first (Android later) app for amateur sport in Morocco — 5-a-side football, padel, tennis.
Organise matches, film them, mark highlights live, get vertical clips, build a player card and climb
neighbourhood / city / Morocco rankings. See `CLAUDE.md` for conventions and `docs/PLAN.md` for milestones.

## Requirements

Node 22+, npm, Docker (for local Supabase), Xcode on macOS for the iOS simulator (or EAS cloud builds).

## Setup

```bash
npm install
cp .env.example .env     # fill in values; never commit .env
npm start                # Expo dev server
```

## Commands

| Command                                                           | Purpose                                                         |
| ----------------------------------------------------------------- | --------------------------------------------------------------- |
| `npm test`                                                        | Jest + React Native Testing Library                             |
| `npm run typecheck`                                               | `tsc --noEmit` (strict)                                         |
| `npm run lint` / `npm run format:check`                           | ESLint / Prettier                                               |
| `PGURL=postgresql://user:pass@localhost:5432 scripts/test-sql.sh` | Migrations + SQL RLS tests on plain Postgres (no Docker needed) |
| `maestro test e2e/auth_lifecycle.yaml`                            | End-to-end account lifecycle (macOS + simulator)                |
| `npx supabase start` / `db reset`                                 | Local Supabase (needs Docker)                                   |
| `eas build --profile <development\|preview\|production>`          | EAS builds (requires approval, see CLAUDE.md)                   |

## Environment variables

See `.env.example`. Public (`EXPO_PUBLIC_*`) values are embedded in the app; secrets live only in
Supabase/EAS secrets.

## Architecture

- `src/app/` Expo Router routes (`(tabs)/` = Accueil, Jouer, Filmer, Classement, Profil)
- `src/theme/` design tokens (light/dark), fonts · `src/i18n/` FR (default), AR (RTL), EN
- `src/components/` shared UI · `__tests__/` Jest tests
- `worker/` clip worker (ffmpeg, Node) · `docs/VIDEO.md` video architecture
- `supabase/` config, migrations, functions, SQL tests (from M1)
- `design/dima-play-mvp.html` visual reference (demo, fictional data)
