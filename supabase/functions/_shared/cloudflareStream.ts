import type {
  AssetInfo,
  CreatedUpload,
  CreateUploadInput,
  VideoProvider,
  WebhookEvent,
} from './videoProvider.ts';

export interface CloudflareStreamConfig {
  accountId: string;
  apiToken: string;
  webhookSecret: string;
  fetchFn?: typeof fetch;
}

const API = 'https://api.cloudflare.com/client/v4';
const WEBHOOK_TOLERANCE_SECONDS = 300;

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function stateOf(video: { readyToStream?: boolean; status?: { state?: string } }) {
  if (video.readyToStream || video.status?.state === 'ready') return 'ready' as const;
  if (video.status?.state === 'error') return 'failed' as const;
  return 'processing' as const;
}

/**
 * Cloudflare Stream adapter (tus direct-creator uploads, downloads endpoint, signed webhooks).
 * Endpoint shapes follow developers.cloudflare.com/stream; the webhook signature scheme and
 * download endpoint must be re-verified against a live account before the first TestFlight build.
 */
export function cloudflareStream(cfg: CloudflareStreamConfig): VideoProvider {
  const doFetch = cfg.fetchFn ?? fetch;
  const base = `${API}/accounts/${cfg.accountId}/stream`;
  const auth = { Authorization: `Bearer ${cfg.apiToken}` };

  async function json<T>(res: Response): Promise<T> {
    if (!res.ok) throw new Error(`cloudflare_stream_${res.status}`);
    const body = (await res.json()) as { success?: boolean; result: T };
    if (body.success === false) throw new Error('cloudflare_stream_error');
    return body.result;
  }

  return {
    name: 'cloudflare-stream',

    async createUpload(i: CreateUploadInput): Promise<CreatedUpload> {
      const metadata = [
        `maxDurationSeconds ${b64(String(i.maxDurationSeconds))}`,
        `expiry ${b64(i.uploadDeadline.toISOString())}`,
        `name ${b64(i.name)}`,
        'requiresignedurls',
      ].join(',');
      const res = await doFetch(`${base}?direct_user=true`, {
        method: 'POST',
        headers: {
          ...auth,
          'Tus-Resumable': '1.0.0',
          'Upload-Length': String(i.sizeBytes),
          'Upload-Metadata': metadata,
        },
      });
      if (!res.ok) throw new Error(`cloudflare_stream_${res.status}`);
      const uploadUrl = res.headers.get('Location');
      const assetId = res.headers.get('stream-media-id');
      if (!uploadUrl || !assetId) throw new Error('cloudflare_stream_missing_upload_headers');
      return { assetId, uploadUrl };
    },

    async getAsset(assetId: string): Promise<AssetInfo> {
      const video = await json<{
        readyToStream?: boolean;
        status?: { state?: string };
        duration?: number;
      }>(await doFetch(`${base}/${assetId}`, { headers: auth }));
      const duration = video.duration && video.duration > 0 ? video.duration : undefined;
      return { state: stateOf(video), durationSeconds: duration };
    },

    async getDownloadUrl(assetId: string): Promise<string | null> {
      const read = async (method: 'GET' | 'POST') =>
        json<{ default?: { status?: string; url?: string } }>(
          await doFetch(`${base}/${assetId}/downloads`, { method, headers: auth }),
        );
      let d = await read('GET').catch(
        () => ({}) as { default?: { status?: string; url?: string } },
      );
      if (!d.default) d = await read('POST'); // first request enables the MP4 rendition
      return d.default?.status === 'ready' && d.default.url ? d.default.url : null;
    },

    async deleteAsset(assetId: string): Promise<void> {
      const res = await doFetch(`${base}/${assetId}`, { method: 'DELETE', headers: auth });
      if (!res.ok && res.status !== 404) throw new Error(`cloudflare_stream_${res.status}`);
    },

    async parseWebhook(rawBody, headers, now = new Date()): Promise<WebhookEvent | null> {
      const header = headers['webhook-signature'];
      if (!header) return null;
      const parts = Object.fromEntries(
        header.split(',').map((kv) => kv.split('=') as [string, string]),
      );
      const time = Number(parts.time);
      if (!parts.sig1 || !Number.isFinite(time)) return null;
      if (Math.abs(now.getTime() / 1000 - time) > WEBHOOK_TOLERANCE_SECONDS) return null;
      const expected = await hmacHex(cfg.webhookSecret, `${parts.time}.${rawBody}`);
      if (expected.length !== parts.sig1.length) return null;
      let diff = 0;
      for (let k = 0; k < expected.length; k++)
        diff |= expected.charCodeAt(k) ^ parts.sig1.charCodeAt(k);
      if (diff !== 0) return null;
      const video = JSON.parse(rawBody) as {
        uid?: string;
        readyToStream?: boolean;
        status?: { state?: string };
        duration?: number;
      };
      if (!video.uid) return null;
      return {
        assetId: video.uid,
        state: stateOf(video),
        durationSeconds: video.duration && video.duration > 0 ? video.duration : undefined,
      };
    },
  };
}

export { hmacHex as _hmacHexForTests };
