import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { AppException } from '../common/exceptions/app.exception';
import { HttpStatus } from '@nestjs/common';

// The only image types the apps ever need for a profile photo. Kept
// narrow deliberately — this is a presigned PUT the client uploads
// directly to, so the server never sees the bytes; content-type
// allowlisting here (echoed into the presigned URL's signed headers)
// is the one control point we have against someone using this to land
// arbitrary files in the bucket.
const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// What this presign is for — folds into the object key so photos are
// browsable/auditable per-owner-type in the bucket console, and so a
// member's presigned URL can never be reused to overwrite a trainer's
// key (ownerType + ownerId are both server-derived from the JWT, never
// client-supplied).
export type UploadKind = 'member-photo' | 'trainer-photo';

interface PresignResult {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresInSeconds: number;
}

@Injectable()
export class UploadsService {
  private readonly client: S3Client | null;
  private readonly bucket: string | null;
  private readonly endpoint: string | null;
  private readonly region: string | null;
  private readonly expiresInSeconds = 300; // 5 minutes — long enough for a mobile upload over a weak connection, short enough that a leaked URL isn't a standing hole

  constructor(private readonly config: ConfigService) {
    const storage = this.config.get<{
      bucket: string | null;
      accessKey: string | null;
      secretKey: string | null;
      endpoint: string | null;
      region: string | null;
    }>('storage')!;

    this.bucket = storage.bucket;
    this.endpoint = storage.endpoint;
    this.region = storage.region || 'us-east-1';

    // All five S3_* vars are required together (see .env.example) — if
    // any is missing we deliberately leave the client unset rather than
    // half-configure it, so `isConfigured()` is the single source of
    // truth callers check instead of each guessing which var mattered.
    if (storage.bucket && storage.accessKey && storage.secretKey && storage.endpoint) {
      this.client = new S3Client({
        region: this.region,
        endpoint: storage.endpoint,
        // DigitalOcean Spaces, Cloudflare R2 and most non-AWS S3-compatible
        // providers require path-style addressing (bucket.endpoint/key
        // virtual-hosted style either isn't supported or needs extra DNS
        // setup); AWS S3 itself also accepts path-style, so this is the
        // one setting that works correctly across every provider without
        // a separate config flag per platform.
        forcePathStyle: true,
        credentials: { accessKeyId: storage.accessKey, secretAccessKey: storage.secretKey },
      });
    } else {
      this.client = null;
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Issues a presigned PUT URL the client (mobile app or portal) uploads
   * the image bytes to directly — the file never transits this API
   * process. Returns both the upload URL (short-lived, PUT only) and the
   * final public URL to store as `photoUrl` once the upload succeeds;
   * callers PATCH that public URL onto the Member/Trainer row themselves
   * after a successful upload (this endpoint doesn't touch the DB — it
   * has no way to know the upload actually completed).
   *
   * Throws a clear, typed error (not a generic 500) if storage isn't
   * configured or the content type isn't an allowed image type —
   * exactly what .env.example's "upload endpoints return a clear
   * 'storage not configured' error" comment promises.
   */
  async presignUpload(kind: UploadKind, ownerId: string, contentType: string): Promise<PresignResult> {
    if (!this.client || !this.bucket) {
      throw new AppException(
        'STORAGE_NOT_CONFIGURED',
        'Photo upload is not available: object storage is not configured on this server.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const ext = ALLOWED_CONTENT_TYPES[contentType];
    if (!ext) {
      throw new AppException(
        'UNSUPPORTED_FILE_TYPE',
        'Only JPEG, PNG or WebP images are allowed.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const key = `photos/${kind}/${ownerId}/${randomUUID()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ACL: 'public-read', // profile photos are meant to be publicly viewable in the apps/portals — same trust model as the plain photoUrl string field they were already stored in
    });

    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: this.expiresInSeconds });

    return {
      uploadUrl,
      publicUrl: this.publicUrlFor(key),
      key,
      expiresInSeconds: this.expiresInSeconds,
    };
  }

  private publicUrlFor(key: string): string {
    // Path-style public URL, consistent with forcePathStyle above.
    // Works for AWS S3, DigitalOcean Spaces and R2 alike; if a provider
    // fronts the bucket with a CDN domain, override by setting photoUrl
    // to the CDN-rewritten form client-side — this is the origin URL.
    const base = (this.endpoint || '').replace(/\/+$/, '');
    return `${base}/${this.bucket}/${key}`;
  }
}
