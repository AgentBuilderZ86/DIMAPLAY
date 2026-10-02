# Video, moments and clips (M3)

## Flow

1. **Filmer** (Film tab): `start_recording` -> VisionCamera records 720p/4 Mbit/s MP4 (≈1.8 GB/hour,
   max 2 h, microphone optional) -> `stop_recording` -> job added to the persistent upload queue.
   An existing video can be **imported** from the photo library; the filmer marks moments while
   watching it (`add_moment_at`) before sending it.
2. **Live moments**: any participant taps a move (goal, assist, save / smash, bandeja, defence /
   ace, passing, volley) for themselves or a team-mate. The server stamps the time (`mark_moment`),
   so offsets are aligned on the recording start regardless of phone clocks. Other phones follow the
   recording state through Supabase Realtime (with a 10 s polling fallback).
3. **Upload**: `create-upload` Edge Function asks the provider for a tus URL (limited to 2 h, 8 GB,
   24 h deadline). The app sends 8 MiB chunks (`tus.ts`); every failure re-reads the server offset, so
   nothing is sent twice. State is persisted on disk and resumed at launch, when the network returns
   and when the app comes back to the foreground. `finish_upload` is idempotent.
4. **Processing**: provider webhook (`video-webhook`, signed) marks the original ready and
   `plan_clips` creates one clip per moment (8 s before, 4 s after, clamped).
5. **Clips**: the **worker** (`worker/`) claims queued clips, cuts them from the original's MP4 with
   ffmpeg, renders 1080x1920 (full pitch over a blurred copy of itself), stores them in the private
   `clips` bucket and sends "Tes clips sont prêts" through Expo push when a video's clips are done.
6. **Share**: clip player (expo-video) + iOS share sheet (expo-sharing) with the downloaded MP4.
7. **Expiry & erasure**: originals expire 30 days after recording (`expire_originals`, daily);
   clips stay. Deleting an account cascades to its videos/moments/clips and queues the provider
   assets and stored files in `provider_deletions` for the worker to erase.

## Provider abstraction

`supabase/functions/_shared/videoProvider.ts` defines `VideoProvider`; `cloudflareStream.ts` is the
implementation. Cloudflare Stream's clip API cannot crop to 9:16 and bills clips as extra videos, so
clips are produced by the worker instead and the provider only stores/transcodes originals.
Swapping to Mux means writing another adapter (upload URL, MP4 URL, delete, webhook).

## Consent rules (enforced in SQL)

- A clip is `match`-only by default (players of that match).
- `public` needs every player to have accepted being filmed for this match **and** no minor on the
  pitch; only the filmer or the player concerned can change it.

## What is verified here, and what is not

Verified by automated tests: the SQL rules (`supabase/tests/30_video_clips.sql`), the resumable
upload against a real socket with mid-chunk cuts, the queue (restart/pause/retry), the provider
adapter (mocked HTTP + webhook signature), the worker with real ffmpeg (1080x1920, correct duration,
audio), notifications, and the app screens' logic.

**Not verified yet (needs a device and provider accounts):**

- Real recording/preview with VisionCamera and the iOS share sheet (no simulator in the dev container).
- A real Cloudflare Stream account: tus URL creation, MP4 download endpoint, webhook signature format.
- Real 50-minute upload over a flaky network from a phone.
- **iOS background limit**: JavaScript is suspended shortly after the app leaves the foreground, so a
  long upload pauses and resumes when the app is reopened (or by a background-task wake-up). True
  uninterrupted background upload needs a native `URLSession` background module; to spike on a device
  before the pilot.
- Push delivery (needs an EAS project id and an APNs key).
- Worker throughput: rendering a 12 s clip with the blur effect took ~15 s on the dev container CPU;
  size the worker accordingly.
