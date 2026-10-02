// Issues (or re-issues) the resumable upload URL for a video the caller is filming/importing.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { providerFromEnv } from '../_shared/provider.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const MAX_BYTES = 8 * 1024 ** 3; // 8 GB ≈ 60 min at a high phone bitrate
const MAX_DURATION_SECONDS = 2 * 60 * 60;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);
  const url = Deno.env.get('SUPABASE_URL')!;
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: auth } = await asUser.auth.getUser();
  if (!auth.user) return json({ error: 'unauthorized' }, 401);

  const body = (await req.json().catch(() => null)) as {
    video_id?: string;
    size_bytes?: number;
  } | null;
  const size = body?.size_bytes;
  if (!body?.video_id || !Number.isInteger(size) || size! < 1 || size! > MAX_BYTES) {
    return json({ error: 'invalid_request' }, 400);
  }

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: video } = await admin
    .from('videos')
    .select('id, author_id, status, match_id')
    .eq('id', body.video_id)
    .maybeSingle();
  // Only the filmer, only once recording is over.
  if (!video || video.author_id !== auth.user.id) return json({ error: 'not_found' }, 404);
  if (video.status !== 'uploading') return json({ error: 'not_uploadable' }, 409);

  const { data: existing } = await admin
    .from('video_uploads')
    .select('upload_url')
    .eq('video_id', video.id)
    .maybeSingle();
  if (existing) return json({ upload_url: existing.upload_url });

  try {
    const provider = providerFromEnv();
    const created = await provider.createUpload({
      sizeBytes: size!,
      maxDurationSeconds: MAX_DURATION_SECONDS,
      uploadDeadline: new Date(Date.now() + 24 * 3600 * 1000),
      name: `match-${video.match_id}`,
    });
    await admin
      .from('videos')
      .update({ provider: provider.name, provider_asset_id: created.assetId })
      .eq('id', video.id);
    await admin.from('video_uploads').insert({ video_id: video.id, upload_url: created.uploadUrl });
    return json({ upload_url: created.uploadUrl });
  } catch {
    return json({ error: 'provider_error' }, 502);
  }
});
