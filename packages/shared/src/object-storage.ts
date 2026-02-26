import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ObjectStoragePort } from '@sovran/domain';

const UPLOAD_URL_TTL_SECONDS = 15 * 60; // 15 min
const DOWNLOAD_URL_TTL_SECONDS = 60 * 60; // 1h

export interface MinioObjectStorageConfig {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  /** Public endpoint for presigned URLs (e.g. http://localhost:9000 when API runs in Docker). Falls back to endpoint if not set. */
  publicEndpoint?: string;
}

export class MinioObjectStorage implements ObjectStoragePort {
  private readonly client: S3Client;
  private readonly signingClient: S3Client;
  private readonly bucket: string;

  constructor(config: MinioObjectStorageConfig) {
    this.bucket = config.bucket;
    const baseConfig = {
      region: 'us-east-1' as const,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: true,
    };
    this.client = new S3Client({ ...baseConfig, endpoint: config.endpoint });
    this.signingClient = new S3Client({
      ...baseConfig,
      endpoint: config.publicEndpoint ?? config.endpoint,
    });
  }

  async generateUploadUrl(key: string, contentType: string, sizeBytes: number): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,
    });
    return getSignedUrl(this.signingClient, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
  }

  async generateDownloadUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.signingClient, command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async getObjectStream(key: string): Promise<AsyncIterable<Uint8Array>> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    const body = response.Body;
    if (!body) {
      throw new Error('Object not found or empty');
    }
    return body as AsyncIterable<Uint8Array>;
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }
}
