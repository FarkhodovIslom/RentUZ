import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { RentalRequestsService } from '../rental-requests/rental-requests.service.js';

/**
 * Every 6 h (§70) — abandoned PENDING requests whose startDate slipped more
 * than a day into the past → EXPIRED (§86 deviation). Conditional updates
 * keep re-runs idempotent; each expiry emits an event (→ notification).
 */
@Processor('expire-pending-requests', { concurrency: 1 })
export class ExpirePendingRequestsProcessor extends WorkerHost {
  private readonly logger = new Logger(ExpirePendingRequestsProcessor.name);

  constructor(private readonly requests: RentalRequestsService) {
    super();
  }

  async process(_job: Job): Promise<{ expired: number }> {
    const { expiredIds } = await this.requests.expireStalePending(new Date());
    if (expiredIds.length > 0) {
      this.logger.log(`expired ${expiredIds.length} pending request(s)`);
    }
    return { expired: expiredIds.length };
  }
}
