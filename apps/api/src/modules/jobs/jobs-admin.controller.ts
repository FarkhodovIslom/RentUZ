import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Roles } from '../../common/decorators/roles.decorator.js';

/**
 * §4 DoD admin visibility: last runs + next scheduled time per queue, read
 * straight from BullMQ (no run-log table). Gated @Roles('ADMIN').
 */
@ApiTags('jobs')
@Roles('ADMIN')
@Controller('jobs')
export class JobsAdminController {
  constructor(
    @InjectQueue('fx-rates') private readonly fxQueue: Queue,
    @InjectQueue('orphan-images') private readonly orphanQueue: Queue,
    @InjectQueue('complete-rentals') private readonly completeRentalsQueue: Queue,
    @InjectQueue('expire-pending-requests') private readonly expireQueue: Queue,
  ) {}

  @Get()
  async list() {
    const queues: Array<[string, Queue]> = [
      ['fx-rates', this.fxQueue],
      ['orphan-images', this.orphanQueue],
      ['complete-rentals', this.completeRentalsQueue],
      ['expire-pending-requests', this.expireQueue],
    ];
    const out = [];
    for (const [name, queue] of queues) {
      // removeOnComplete:10/removeOnFail:30 caps the retained history — the
      // "last 20 runs" DoD reads whatever BullMQ still holds, newest first.
      const jobs = await queue.getJobs(['completed', 'failed'], 0, 20, false);
      const schedulers = await queue.getJobSchedulers();
      out.push({
        queue: name,
        runs: jobs.slice(0, 20).map((job) => ({
          id: job.id,
          state: 'failedReason' in job && job.failedReason ? 'failed' : 'completed',
          finishedAt: job.finishedOn ?? null,
          failedReason: job.failedReason ?? null,
        })),
        nextRunAt: schedulers[0]?.next ?? null,
      });
    }
    return out;
  }
}
