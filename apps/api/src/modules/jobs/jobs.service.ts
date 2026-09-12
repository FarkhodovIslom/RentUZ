import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

/**
 * Schedules the two repeatable jobs on boot (1h; the cron is UTC, computed
 * for 06:00 Asia/Tashkent = 01:00 UTC).
 */
@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectQueue('fx-rates') private readonly fxQueue: Queue,
    @InjectQueue('orphan-images') private readonly orphanQueue: Queue,
    @InjectQueue('complete-rentals') private readonly completeRentalsQueue: Queue,
    @InjectQueue('expire-pending-requests') private readonly expirePendingQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    // Integration tests (and any env that sets DISABLE_JOBS) must not
    // schedule background work against shared infrastructure — BullMQ also
    // fires overdue cron slots on boot (catch-up), which would race the
    // tests' fixture data.
    if (process.env.DISABLE_JOBS === 'true') {
      this.logger.log('jobs disabled (DISABLE_JOBS=true)');
      return;
    }
    // BullMQ 6.3.4's JobsOptions type doesn't expose `repeat` yet (the runtime
    // accepts it; the type lags behind the docs). Cast to satisfy the compiler
    // and to keep the schedule declarative.
    const repeatableOpts = (pattern: string) => ({
      repeat: { pattern, tz: 'UTC' },
      removeOnComplete: 10,
      removeOnFail: 30,
    });
    await Promise.all([
      this.fxQueue.add('daily', {}, { ...repeatableOpts('0 1 * * *'), jobId: 'fx-rates-daily' } as never),
      this.orphanQueue.add('tick', {}, { ...repeatableOpts('0 */6 * * *'), jobId: 'orphan-images-tick' } as never),
      this.completeRentalsQueue.add('tick', {}, { ...repeatableOpts('0 * * * *'), jobId: 'complete-rentals-hourly' } as never),
      this.expirePendingQueue.add('tick', {}, { ...repeatableOpts('0 */6 * * *'), jobId: 'expire-pending-6h' } as never),
    ]);
    this.logger.log('jobs scheduled: fx-rates daily, orphan-images every 6h, complete-rentals hourly, expire-pending every 6h');
  }
}
