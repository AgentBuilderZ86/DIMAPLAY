/** Storage/transcoding provider behind the app's video features. Implementations are swappable. */
export interface CreateUploadInput {
  sizeBytes: number;
  maxDurationSeconds: number;
  /** Uploads must start before this instant. */
  uploadDeadline: Date;
  name: string;
}

export interface CreatedUpload {
  assetId: string;
  /** Resumable (tus 1.0.0) upload endpoint; acts as a bearer credential. */
  uploadUrl: string;
}

export type AssetState = 'processing' | 'ready' | 'failed';

export interface AssetInfo {
  state: AssetState;
  durationSeconds?: number;
}

export interface VideoProvider {
  readonly name: string;
  createUpload(input: CreateUploadInput): Promise<CreatedUpload>;
  getAsset(assetId: string): Promise<AssetInfo>;
  /** A URL serving the full-quality MP4 of the asset (used by the clip worker), or null while not ready. */
  getDownloadUrl(assetId: string): Promise<string | null>;
  deleteAsset(assetId: string): Promise<void>;
  /** Validates a provider webhook; returns the parsed asset update or null if the signature is invalid. */
  parseWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>,
    now?: Date,
  ): Promise<WebhookEvent | null>;
}

export interface WebhookEvent {
  assetId: string;
  state: AssetState;
  durationSeconds?: number;
}
