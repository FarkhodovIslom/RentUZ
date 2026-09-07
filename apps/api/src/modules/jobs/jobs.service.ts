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
  ) {}

  async onModuleInit(): Promise<void> {
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
    ]);
    this.logger.log('jobs scheduled: fx-rates daily, orphan-images every 6h');
  }
}
