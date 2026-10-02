import { cloudflareStream } from './cloudflareStream.ts';
import type { VideoProvider } from './videoProvider.ts';

/** Builds the configured provider from Edge Function secrets (Deno). */
export function providerFromEnv(): VideoProvider {
  const env = (k: string) => {
    const v = Deno.env.get(k);
    if (!v) throw new Error(`missing_secret_${k}`);
    return v;
  };
  return cloudflareStream({
    accountId: env('CLOUDFLARE_ACCOUNT_ID'),
    apiToken: env('CLOUDFLARE_STREAM_TOKEN'),
    webhookSecret: env('CLOUDFLARE_STREAM_WEBHOOK_SECRET'),
  });
}
