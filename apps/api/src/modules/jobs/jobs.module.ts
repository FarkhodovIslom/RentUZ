import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ImagesModule } from '../../common/services/images.module.js';
import { HealthModule } from '../../health/health.module.js';
import { FxRatesProcessor, OrphanImagesProcessor } from './jobs.processor.js';
import { CompleteRentalsProcessor } from './complete-rentals.processor.js';
import { ExpirePendingRequestsProcessor } from './expire-pending-requests.processor.js';
import { DailyStatsProcessor } from './daily-stats.processor.js';
import { NotificationsCleanupProcessor } from './notifications-cleanup.processor.js';
import { JobsAdminController } from './jobs-admin.controller.js';
import { JobsService } from './jobs.service.js';
import { RentalRequestsModule } from '../rental-requests/rental-requests.module.js';

@Module({
  imports: [
    ConfigModule,
    BullModule.forRoot({
      connection: {
        // Connect via the same ioredis instance the app already uses.
        // We can't share a client because @nestjs/bullmq expects a real
        // ioredis options object; re-reading REDIS_URL is fine.
        // (For high throughput, replace with a dedicated connection.)
        host: new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').hostname,
        port: Number(new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').port) || 6379,
      },
    }),
    BullModule.registerQueue(
      { name: 'fx-rates' },
      { name: 'orphan-images' },
      { name: 'complete-rentals' },
      { name: 'expire-pending-requests' },
      { name: 'daily-stats' },
      { name: 'notifications-cleanup' },
    ),
    ImagesModule, // provides S3 client to the orphan processor
    HealthModule, // exports MetricsController for the queue-backlog gauge
    RentalRequestsModule, // complete-rentals / expire-pending processors
  ],
  controllers: [JobsAdminController],
  providers: [FxRatesProcessor, OrphanImagesProcessor, CompleteRentalsProcessor, ExpirePendingRequestsProcessor, DailyStatsProcessor, NotificationsCleanupProcessor, JobsService],
  exports: [JobsService],
})
export class JobsModule {}
