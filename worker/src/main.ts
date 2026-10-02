import { createClient } from '@supabase/supabase-js';

import { cloudflareStream } from '../../supabase/functions/_shared/cloudflareStream.ts';
import { runOnce } from './worker.ts';

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k}`);
  return v;
};

const deps = {
  db: createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY')),
  provider: cloudflareStream({
    accountId: env('CLOUDFLARE_ACCOUNT_ID'),
    apiToken: env('CLOUDFLARE_STREAM_TOKEN'),
    webhookSecret: env('CLOUDFLARE_STREAM_WEBHOOK_SECRET'),
  }),
  log: (m: string) => console.log(new Date().toISOString(), m),
};

const idleMs = Number(process.env.WORKER_IDLE_MS ?? 5000);
let lastExpiry = 0;

async function loop(): Promise<void> {
  for (;;) {
    try {
      const r = await runOnce(deps);
      if (Date.now() - lastExpiry > 6 * 3600_000) {
        lastExpiry = Date.now();
        await deps.db.rpc('expire_originals');
      }
      if (r.claimed === 0) await new Promise((res) => setTimeout(res, idleMs));
    } catch (e) {
      deps.log(`loop error: ${(e as Error).message}`);
      await new Promise((res) => setTimeout(res, idleMs * 2));
    }
  }
}

void loop();
