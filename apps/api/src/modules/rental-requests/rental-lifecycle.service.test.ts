import { describe, expect, it } from 'vitest';
import { RentalLifecycleService } from './rental-lifecycle.service.js';

describe('RentalLifecycleService.materializeEndDate', () => {
  const svc = new RentalLifecycleService();

  it('adds whole months on the same day-of-month', () => {
    expect(
      svc.materializeEndDate({ startDate: new Date('2026-01-15'), durationMonths: 12 }),
    ).toEqual(new Date('2027-01-15'));
    expect(
      svc.materializeEndDate({ startDate: new Date('2026-03-01'), durationMonths: 6 }),
    ).toEqual(new Date('2026-09-01'));
  });

  it('clamps month-end overflow (Jan 31 + 1m → Feb 28)', () => {
    expect(
      svc.materializeEndDate({ startDate: new Date('2028-01-31'), durationMonths: 1 }), // 2028 leap year
    ).toEqual(new Date('2028-02-29'));
    expect(
      svc.materializeEndDate({ startDate: new Date('2026-01-31'), durationMonths: 1 }), // non-leap
    ).toEqual(new Date('2026-02-28'));
    expect(
      svc.materializeEndDate({ startDate: new Date('2026-08-31'), durationMonths: 6 }),
    ).toEqual(new Date('2027-02-28'));
  });

  it('handles the 36-month maximum', () => {
    expect(
      svc.materializeEndDate({ startDate: new Date('2026-06-01'), durationMonths: 36 }),
    ).toEqual(new Date('2029-06-01'));
  });
});

describe('RentalLifecycleService.isActive', () => {
  const svc = new RentalLifecycleService();

  it('true only for ACCEPTED rentals whose end is still in the future', () => {
    const rental = { startDate: new Date('2026-01-01'), durationMonths: 12, status: 'ACCEPTED' };
    expect(svc.isActive(rental, new Date('2026-06-15'))).toBe(true);
    expect(svc.isActive(rental, new Date('2027-01-01'))).toBe(false); // endDate boundary
    expect(svc.isActive(rental, new Date('2026-12-31'))).toBe(true);
  });

  it('false for any non-ACCEPTED status regardless of window', () => {
    for (const status of ['PENDING', 'REJECTED', 'CANCELLED', 'EXPIRED', 'COMPLETED']) {
      expect(
        svc.isActive({ startDate: new Date('2026-01-01'), durationMonths: 12, status }, new Date('2026-06-15')),
      ).toBe(false);
    }
  });
});
