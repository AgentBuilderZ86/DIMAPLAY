# Clip worker

Node service that turns marked moments into vertical 9:16 clips.

1. `claim_clips()` (service role) hands out queued clips whose original is ready.
2. Asks the video provider for an MP4 URL of the original, cuts `[start, end]` with ffmpeg and renders
   it 1080x1920 (blurred background + full pitch in the centre).
3. Uploads to the private `clips` Storage bucket and marks the clip ready.
4. When a video's last clip is ready, sends "Tes clips sont prêts" through the Expo push service.
5. Erases provider assets / stored files queued in `provider_deletions` and runs `expire_originals()`.

```bash
npm run worker:build
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... CLOUDFLARE_ACCOUNT_ID=... \
CLOUDFLARE_STREAM_TOKEN=... CLOUDFLARE_STREAM_WEBHOOK_SECRET=... node worker/dist/worker/src/main.js
```

Needs `ffmpeg` on the host. Any small container platform works (one instance is enough to start).
