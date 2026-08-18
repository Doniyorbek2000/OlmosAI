import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export interface PresignedUpload {
  url: string;
  key: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresIn: number;
}

/**
 * S3-compatible storage (AWS S3 / Cloudflare R2 / MinIO). Buckets are PRIVATE.
 * Uploads happen directly via presigned PUT URLs (never streamed through the
 * API); downloads use short-lived presigned GET URLs (spec §22).
 */
export class StorageService {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(config: StorageConfig) {
    this.bucket = config.bucket;
    this.s3 = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  /** Presign a direct upload. contentType is enforced on the PUT. */
  async presignUpload(
    key: string,
    contentType: string,
    expiresIn = 900,
  ): Promise<PresignedUpload> {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(this.s3, cmd, { expiresIn });
    return { url, key, method: 'PUT', headers: { 'content-type': contentType }, expiresIn };
  }

  /** Short-lived signed download URL. */
  async presignDownload(key: string, expiresIn = 900, downloadName?: string): Promise<string> {
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: downloadName
        ? `attachment; filename="${downloadName}"`
        : undefined,
    });
    return getSignedUrl(this.s3, cmd, { expiresIn });
  }

  async putObject(key: string, body: Uint8Array | Buffer, contentType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async headObject(key: string): Promise<{ size: number; contentType?: string } | null> {
    try {
      const res = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: res.ContentLength ?? 0, contentType: res.ContentType };
    } catch {
      return null;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

/** Deterministic, collision-resistant object keys, namespaced by owner. */
export function buildAssetKey(parts: {
  userId: string;
  assetId: string;
  version: number;
  role: string;
  filename: string;
}): string {
  const safe = parts.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `users/${parts.userId}/assets/${parts.assetId}/v${parts.version}/${parts.role}/${safe}`;
}

export function buildUploadKey(userId: string, uploadId: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `users/${userId}/uploads/${uploadId}/${safe}`;
}
