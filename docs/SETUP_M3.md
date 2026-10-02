# M3 setup checklist (needs your accounts — nothing here was created for you)

1. **Cloudflare account + Stream** (paid plan; see `docs/PLAN.md` for the Mux comparison).
   Create an API token with _Stream: Edit_, and a webhook (Stream > Notifications) pointing to the
   `video-webhook` function URL; note its signing secret.
2. **Supabase secrets** for the Edge Functions:
   `npx supabase secrets set CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_STREAM_TOKEN=... CLOUDFLARE_STREAM_WEBHOOK_SECRET=...`
   then `npx supabase functions deploy create-upload video-webhook` and `npx supabase db push`.
3. **Worker host**: any small container platform with ffmpeg. Env: `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, the three Cloudflare variables. `npm run worker:build` then
   `node worker/dist/worker/src/main.js`.
4. **Push notifications**: `eas init` (project id -> `EXPO_PUBLIC_EAS_PROJECT_ID`) and an APNs key via EAS credentials.
5. **Development build** (EAS `development` profile): VisionCamera and the other native modules do not run in Expo Go.
