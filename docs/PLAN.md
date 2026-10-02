# PLAN — Dima Play v1

Status: M0 implemented on branch `m0-foundation` (go received). Reference design: `design/dima-play-mvp.html`.
Demo items out of v1 scope (kept as extension points): court booking, club space, sponsor circuit. Demo's "AI detects players" is replaced by self-tagging (no biometrics).

## Milestones (each: branch `m<N>-<name>`, tests green, report)

| M                     | Scope                                                                                              | Key tasks                                                                      | Acceptance                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| M0 Foundation         | repo, Expo TS strict, lint/format, CI, local Supabase, tokens, fonts, tabs, i18n FR/AR/EN          | scaffold; theme tokens + dark; 5 tabs (Filmer raised yellow); i18n; GH Actions | `npm test` + typecheck green in CI; simulator shows 5 styled empty tabs          |
| M1 Accounts           | Apple sign-in, phone OTP, onboarding, profile, account deletion                                    | schema profiles/consents; RLS; delete-account function (30-day purge)          | Maestro create/login/logout/delete; SQL RLS tests                                |
| M2 Matches & rankings | create/join, teams, score + confirmation, Elo, rankings                                            | matches/participants/results; Elo fn; materialized views + cron refresh        | 10-account match updates Elo + rankings; contested score not counted             |
| M3 Video & clips      | record/import, resumable bg upload, live moments, clips, feed, share                               | vision-camera; tus; Realtime moments; VideoProvider; clip job; 30-day expiry   | 50-min upload survives network cut; 3 moments → 3 9:16 clips                     |
| M4 Card & collection  | front/back card, attributes, calibration, badges, history                                          | `docs/RATING.md` (needs validation); stats aggregates                          | Card reflects real stats; flip honours reduce-motion                             |
| M5 Safety             | profanity filter FR/AR/darija, report, block, moderation queue, minors                             | reports/blocks/moderation_actions; RLS both-way block                          | Everything reportable; block hides both ways; minors absent from public rankings |
| M6 Monetisation       | RevenueCat, paywall, entitlements, restore                                                         | webhook → `entitlements`; server-side limits                                   | Sandbox buy/restore; limits enforced server-side                                 |
| M7 Polish             | dark, RTL, a11y, empty/error states, Sentry, perf                                                  | VoiceOver audit; i18n lint                                                     | VoiceOver pass on 5 tabs; no hard-coded strings                                  |
| M8 Release            | EAS profiles, icon/splash, demo account, review notes, store copy, privacy/legal docs, screenshots | docs listed in §10                                                             | `preview` build ready; ask before TestFlight/submit                              |

## Cross-cutting deliverables

README, CLAUDE.md, RATING, DATA_MAP, APP_PRIVACY, APP_REVIEW_NOTES, STORE_LISTING, LEGAL_DRAFTS, COSTS.

## Risks

1. **Long recording (60 min)**: file size ~ several GB; need low-bitrate preset, background upload, disk checks, thermal limits.
2. **Background upload on iOS**: needs native background URLSession; tus lib must support it → spike at start of M3.
3. **On-demand clipping cost/latency** depends on provider → spike before locking provider.
4. **Apple 1.2 / 5.1.1 / 3.1.1** are rejection risks; build moderation + deletion + IAP early, not last.
5. **Minors + image rights** (loi 09-08): clip visibility default `match`; public only with all consents.
6. **Elo gaming** (collusive score confirmation): rate limits, min distinct opponents, moderator arbitration.
7. **CNDP transfer authorisation** if hosted outside Morocco: owner is legal; DATA_MAP feeds it.
8. **Sign in with Apple + phone OTP**: OTP SMS cost/deliverability in Morocco (provider choice).
9. Dev env is Linux: iOS simulator/EAS local builds need macOS or EAS cloud builds (approval needed).

## Video provider: Mux vs Cloudflare Stream (pricing to re-verify before M3)

- **Mux**: strong API, per-asset clipping via `start_time/end_time` clip creation (instant clips), good upload (direct/resumable), analytics; pay per minute encoded + stored + delivered; costlier at scale.
- **Cloudflare Stream**: simple pricing (per minute stored + per 1 000 min delivered, no encode fee), tus uploads, clip API exists but fewer controls; cheaper for long raw files.
- Clipping: Mux's clip-from-asset is the closest to "cut on demand"; Cloudflare supports clipping but clips become new billable videos.
- Raw 50–60 min originals dominate storage cost → both bill stored minutes; the 30-day expiry is essential.
- Morocco delivery: both CDN-backed; Cloudflare has Moroccan PoPs (Casablanca) — likely lower latency.
- Vertical 9:16 reframing: neither does smart crop; do it with ffmpeg worker (crop/pad) → favours fallback worker anyway.
- **Recommendation (provisional)**: start with Cloudflare Stream behind `VideoProvider` (cost + tus + PoP), keep ffmpeg worker for 9:16 export; switch to Mux if clip latency/API limits hurt. Confirm with a 1-day spike and live pricing.
