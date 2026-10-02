// Provider -> backend: marks the original ready (or failed) and queues one clip per marked moment.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { providerFromEnv } from '../_shared/provider.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });
  const raw = await req.text();
  const headers: Record<string, string | undefined> = {};
  req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));

  const event = await providerFromEnv().parseWebhook(raw, headers);
  if (!event) return new Response('invalid_signature', { status: 401 });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: video } = await admin
    .from('videos')
    .select('id, status, duration_seconds')
    .eq('provider_asset_id', event.assetId)
    .maybeSingle();
  if (!video) return new Response('unknown_asset', { status: 202 }); // not ours (or already erased)

  if (event.state === 'failed') {
    await admin
      .from('videos')
      .update({ status: 'failed' })
      .eq('id', video.id)
      .in('status', ['uploading', 'processing']);
    return new Response('ok');
  }
  if (event.state === 'ready') {
    await admin
      .from('videos')
      .update({
        status: 'ready',
        duration_seconds: video.duration_seconds ?? event.durationSeconds,
      })
      .eq('id', video.id)
      .in('status', ['uploading', 'processing']);
    const { error } = await admin.rpc('plan_clips', { p_video: video.id });
    if (error) return new Response('plan_failed', { status: 500 }); // provider retries the webhook
  }
  return new Response('ok');
});
