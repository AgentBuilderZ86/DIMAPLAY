# RATING — Elo, card rating and attributes (DRAFT, needs your validation)

Implemented in M2 (SQL `apply_elo`, single source of truth). Sections marked **TO VALIDATE** are
proposals for you to confirm before M4.

## Elo (implemented)

- One rating per player and sport, start **1000**.
- Counted only when the score is **confirmed by the other team** or **arbitrated by a moderator**.
  Pending and contested results count for nothing.
- Team rating = average Elo of the team. Expected score `E = 1 / (1 + 10^((Rb - Ra) / 400))`.
- Result `S`: win 1, draw 0.5 (foot only), loss 0. Padel (doubles) and tennis (singles) have no draws.
- Per-player change `K * mult * (S - E)`, rounded to 0.01:
  - `K = 40` during calibration (first 5 counted matches), `K = 24` afterwards. **TO VALIDATE**
  - `mult` (foot only) = `1 + 0.05 * min(|goal difference|, 4)` -> goal-difference bonus capped at +20 %. **TO VALIDATE**
  - `mult = 1` for padel and tennis.
- "En calibration" is shown while a player has fewer than 5 counted matches.

## Rankings (implemented)

- Scopes: neighbourhood, city, Morocco, per sport; ties broken by more matches, then id.
- Based on the player's declared city/neighbourhood. Minors and unfinished profiles never appear.
- Materialized view refreshed every 15 min (pg_cron on hosted Supabase) with a daily snapshot used
  for the **7-day change** (positive = places gained). Variation is empty until a 7-day-old snapshot exists.

## Card rating 40-99 (M4) — TO VALIDATE

`overall = round(40 + 59 * clamp((elo - 800) / 700, 0, 1))` -> Elo 800 = 40, 1000 = 57, 1500 = 99.

## Attributes (M4) — TO VALIDATE (from the demo, fed by confirmed matches and marked moments)

| Sport                                                                                                | Attributes (6)               | Source                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| Foot                                                                                                 | VIT, TIR, PAS, DRI, DÉF, PHY | goals/shots, assists, saves, win rate, activity; self-assessed speed/physique until enough data |
| Padel                                                                                                | VOL, SMA, BAN, DÉF, LOB, MEN | smashes, bandeja, defence moments, win rate                                                     |
| Tennis                                                                                               | SER, COU, REV, VOL, DÉP, MEN | aces, winners, passing shots, win rate                                                          |
| Open question: attributes that cannot be measured from moments (e.g. speed) — derive from Elo with a |
| sport-specific profile, or let teammates rate (anti-abuse needed)?                                   |

## Anti-gaming (to harden in M5)

Confirmation must come from the opposing team; moderators arbitrate contests. Planned: minimum number
of distinct opponents before a rating enters public rankings, rate limits on match creation.
