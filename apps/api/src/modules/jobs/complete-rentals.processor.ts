import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { RentalRequestsService } from '../rental-requests/rental-requests.service.js';

/**
 * Hourly (§70) — ACCEPTED rentals past their derived endDate → COMPLETED;
 * properties with no remaining active rental go back to ACTIVE. The service
 * uses conditional updates, so a re-run over the same data is a no-op.
 */
@Processor('complete-rentals', { concurrency: 1 })
export class CompleteRentalsProcessor extends WorkerHost {
  private readonly logger = new Logger(CompleteRentalsProcessor.name);

  constructor(private readonly requests: RentalRequestsService) {
    super();
  }

  async process(_job: Job): Promise<{ completed: number }> {
    const { completedIds } = await this.requests.completeExpiredRentals(new Date());
    if (completedIds.length > 0) {
      this.logger.log(`completed ${completedIds.length} rental(s)`);
    }
    return { completed: completedIds.length };
  }
}
