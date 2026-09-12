import { Injectable } from '@nestjs/common';
import { addMonths } from 'date-fns';

/**
 * §25: only `startDate` + `durationMonths` are stored; endDate is derived on
 * read. date-fns `addMonths` clamps month-end overflow (Jan 31 + 1m → Feb 28),
 * matching JS semantics and staying DST-safe in UTC (startDate is @db.Date).
 */
export interface RentalLike {
  startDate: Date;
  durationMonths: number;
}

@Injectable()
export class RentalLifecycleService {
  materializeEndDate(rental: RentalLike): Date {
    return addMonths(rental.startDate, rental.durationMonths);
  }

  /** §26 ACTIVE view: ACCEPTED and the rental window hasn't ended yet. */
  isActive(
    rental: RentalLike & { status: string },
    now: Date = new Date(),
  ): boolean {
    return rental.status === 'ACCEPTED' && this.materializeEndDate(rental) > now;
  }
}
