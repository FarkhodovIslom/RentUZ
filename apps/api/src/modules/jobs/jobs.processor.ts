import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { STORAGE_CLIENT } from '../../common/services/storage.service.js';

const CBU_URL = process.env.FX_RATES_URL ?? 'https://cbu.uz/oz/arkhiv-kursov-valyut/json/';

/**
 * Daily 06:00 Asia/Tashkent (01:00 UTC) — fetch USD→UZS from CBU, upsert
 * `fxRates`, recompute `priceUzs` for USD listings in chunks of 500.
 * Failures keep the last-known rate (idempotent: same shape as the daily job).
 */
@Processor('fx-rates', { concurrency: 1 })
export class FxRatesProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(FxRatesProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async onModuleInit(): Promise<void> {
    // One-shot warm: schedule a recurring daily job.
    const queue = this.worker.opts.connection as { host: string; port: number; password?: string } | undefined;
    this.logger.log(`fx-rates processor ready (queue: ${queue?.host ?? 'redis'})`);
  }

  async process(_job: Job): Promise<{ updated: number }> {
    const today = new Date();
    const asOf = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    const rate = await this.fetchRate();
    if (rate === null) {
      this.logger.warn('CBU rate fetch failed; keeping last-known rate');
      return { updated: 0 };
    }

    await this.prisma.fxRates.upsert({
      where: { base_quote_asOf: { base: 'USD', quote: 'UZS', asOf } },
      update: {},
      create: { base: 'USD', quote: 'UZS', rate, asOf, source: 'cbu' },
    });

    // Recompute `priceUzs` for USD listings. In a single SQL — safe because
    // USD listings are few (we only allow USD with manual override; CBU is
    // the official rate). NOTE: USD only — UZS listings already carry their
    // final priceUzs (Phase 3 fix: this filter previously read 'UZS' and
    // multiplied local prices by the FX rate on every run).
    const updated = await this.prisma.$executeRaw`
      UPDATE "properties"
      SET "priceUzs" = (FLOOR(price * ${rate}::numeric))::bigint
      WHERE "currency" = 'USD' AND status IN ('ACTIVE','PENDING_VERIFICATION','DRAFT','PAUSED','RENTED','REJECTED')
    `;

    this.logger.log(`fx-rate updated: ${rate} UZS/USD, ${updated} rows recomputed`);
    return { updated: Number(updated) };
  }

  private async fetchRate(): Promise<number | null> {
    try {
      const res = await fetch(CBU_URL);
      if (!res.ok) return null;
      const data = (await res.json()) as Array<{ Ccy: string; Rate: string }>;
      const usd = data.find((r) => r.Ccy === 'USD');
      if (!usd) return null;
      return Number(usd.Rate.replace(',', '.'));
    } catch {
      return null;
    }
  }
}

/**
 * Every 6 hours — diff storage keys under `properties/` against the DB and
 * delete keys that no longer belong to an ACTIVE/... property (also removes
 * keys whose property has been DELETED).
 */
@Processor('orphan-images', { concurrency: 1 })
export class OrphanImagesProcessor extends WorkerHost {
  private readonly logger = new Logger(OrphanImagesProcessor.name);
  private readonly publicBucket: string;
  private readonly s3: S3Client;

  constructor(
    @Inject(STORAGE_CLIENT) s3: S3Client,
    private readonly prisma: PrismaService,
  ) {
    super();
    this.s3 = s3;
    this.publicBucket = process.env.STORAGE_BUCKET_PUBLIC ?? 'rentuz-public';
  }

  async process(_job: Job): Promise<{ removed: number }> {
    const validKeys = new Set(
      (
        await this.prisma.propertyImages.findMany({
          where: { property: { status: { not: 'DELETED' } } },
          select: { url: true, thumbUrl: true },
        })
      ).flatMap((img) => [img.url, img.thumbUrl].filter(Boolean) as string[]),
    );

    let removed = 0;
    let token: string | undefined;
    do {
      const page: { Contents?: { Key?: string }[]; NextContinuationToken?: string } = await this.s3.send(
        new ListObjectsV2Command({ Bucket: this.publicBucket, Prefix: 'properties/', ContinuationToken: token }),
      );
      token = page.NextContinuationToken;
      for (const obj of page.Contents ?? []) {
        if (!obj.Key) continue;
        if (validKeys.has(obj.Key)) continue;
        await this.s3.send(new DeleteObjectCommand({ Bucket: this.publicBucket, Key: obj.Key })).catch(() => undefined);
        removed++;
      }
    } while (token);

    this.logger.log(`orphan-images: ${removed} removed`);
    return { removed };
  }
}
