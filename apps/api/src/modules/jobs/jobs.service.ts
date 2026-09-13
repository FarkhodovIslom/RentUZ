import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { MetricsController } from '../../health/metrics.controller.js';

/**
 * Schedules the two repeatable jobs on boot (1h; the cron is UTC, computed
 * for 06:00 Asia/Tashkent = 01:00 UTC).
 */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);

  private readonly queues = new Map<string, Queue>();
  private metricsTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectQueue('fx-rates') fxQueue: Queue,
    @InjectQueue('orphan-images') orphanQueue: Queue,
    @InjectQueue('complete-rentals') completeRentalsQueue: Queue,
    @InjectQueue('expire-pending-requests') expirePendingQueue: Queue,
    @InjectQueue('daily-stats') dailyStatsQueue: Queue,
    @InjectQueue('notifications-cleanup') notificationsCleanupQueue: Queue,
    private readonly metrics: MetricsController,
  ) {
    for (const [name, queue] of Object.entries({
      'fx-rates': fxQueue,
      'orphan-images': orphanQueue,
      'complete-rentals': completeRentalsQueue,
      'expire-pending-requests': expirePendingQueue,
      'daily-stats': dailyStatsQueue,
      'notifications-cleanup': notificationsCleanupQueue,
    })) {
      this.queues.set(name, queue);
    }
  }

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
    const repeatableOpts = (pattern: string, tz = 'UTC') => ({
      repeat: { pattern, tz },
      removeOnComplete: 10,
      removeOnFail: 30,
    });
    await Promise.all([
      this.queues.get('fx-rates')!.add('daily', {}, { ...repeatableOpts('0 1 * * *'), jobId: 'fx-rates-daily' } as never),
      this.queues.get('orphan-images')!.add('tick', {}, { ...repeatableOpts('0 */6 * * *'), jobId: 'orphan-images-tick' } as never),
      this.queues.get('complete-rentals')!.add('tick', {}, { ...repeatableOpts('0 * * * *'), jobId: 'complete-rentals-hourly' } as never),
      this.queues.get('expire-pending-requests')!.add('tick', {}, { ...repeatableOpts('0 */6 * * *'), jobId: 'expire-pending-6h' } as never),
      // §1.2.6/§1.2.7 — Tashkent-local schedules (BullMQ repeat.tz).
      this.queues.get('daily-stats')!.add('rollup', {}, { ...repeatableOpts('0 2 * * *', 'Asia/Tashkent'), jobId: 'daily-stats-2am' } as never),
      this.queues.get('notifications-cleanup')!.add('sweep', {}, { ...repeatableOpts('0 3 * * *', 'Asia/Tashkent'), jobId: 'notifications-cleanup-3am' } as never),
    ]);
    this.logger.log('jobs scheduled: fx-rates daily, orphan-images every 6h, complete-rentals hourly, expire-pending every 6h, daily-stats 02:00 TAK, notifications-cleanup 03:00 TAK');

    // §72 gauge: queue backlog every 30 s (alert threshold in the runbook).
    this.metricsTimer = setInterval(() => {
      void this.refreshQueueGauge();
    }, 30_000);
  }

  /** Snapshot each queue's waiting-job count into rentuz_queue_backlog_jobs. */
  private async refreshQueueGauge(): Promise<void> {
    for (const [name, queue] of this.queues) {
      try {
        const counts = await queue.getJobCounts('waiting', 'delayed');
        this.metrics.queueBacklog.set({ queue: name }, counts.waiting + (counts.delayed ?? 0));
      } catch {
        // Redis blip — the next tick retries; never crash a metrics timer.
      }
    }
  }

  onModuleDestroy(): void {
    if (this.metricsTimer) clearInterval(this.metricsTimer);
  }
}
