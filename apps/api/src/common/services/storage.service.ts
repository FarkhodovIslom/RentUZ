import { Inject, Injectable, Global, Module, type OnModuleDestroy } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * S3-compatible storage (MinIO locally, Supabase Storage in prod).
 * Bucket names come from env (context/0_Phase.md §5).
 */
export const STORAGE_CLIENT = Symbol('STORAGE_CLIENT');

export interface PutResult {
  key: string;
  contentType: string;
  size: number;
}

@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly client: S3Client;
  private readonly publicBucket: string;
  private readonly privateBucket: string;

  constructor(@Inject(STORAGE_CLIENT) client: S3Client) {
    this.client = client;
    this.publicBucket = process.env.STORAGE_BUCKET_PUBLIC ?? 'rentuz-public';
    this.privateBucket = process.env.STORAGE_BUCKET_PRIVATE ?? 'rentuz-private';
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }

  putPublic(key: string, body: Buffer, contentType: string): Promise<PutResult> {
    return this.put(this.publicBucket, key, body, contentType);
  }

  putPrivate(key: string, body: Buffer, contentType: string): Promise<PutResult> {
    return this.put(this.privateBucket, key, body, contentType);
  }

  signedUrl(key: string, ttlSeconds = 600): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.privateBucket, Key: key }),
      { expiresIn: ttlSeconds },
    );
  }

  delete(key: string, bucket: 'public' | 'private' = 'public'): Promise<void> {
    return this.client
      .send(
        new DeleteObjectCommand({
          Bucket: bucket === 'public' ? this.publicBucket : this.privateBucket,
          Key: key,
        }),
      )
      .then(() => undefined);
  }

  head(key: string, bucket: 'public' | 'private' = 'public'): Promise<{ contentLength: number | null }> {
    return this.client
      .send(
        new HeadObjectCommand({
          Bucket: bucket === 'public' ? this.publicBucket : this.privateBucket,
          Key: key,
        }),
      )
      .then((r) => ({ contentLength: r.ContentLength ?? null }));
  }

  private async put(bucket: string, key: string, body: Buffer, contentType: string): Promise<PutResult> {
    await this.client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
    );
    return { key, contentType, size: body.length };
  }
}

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_CLIENT,
      useFactory: (): S3Client => {
        return new S3Client({
          endpoint: process.env.STORAGE_ENDPOINT,
          region: process.env.STORAGE_REGION ?? 'us-east-1',
          forcePathStyle: true, // required for MinIO
          credentials: {
            accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? '',
            secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? '',
          },
        });
      },
    },
    StorageService,
  ],
  exports: [STORAGE_CLIENT, StorageService],
})
export class StorageModule {}
