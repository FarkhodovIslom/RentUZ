import { describe, expect, it } from 'vitest';
import { CreateRentalRequestInput, MyRentalsTab, RequestStatus, UpdateRentalRequestInput } from './rental-requests.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const uuid = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

function validDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY_MS).toISOString();
}

function base(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    propertyId: uuid,
    message: 'Salom, bu uy ijaraga olishim mumkinmi?',
    startDate: validDate(7),
    durationMonths: 12,
    ...overrides,
  };
}

describe('CreateRentalRequestInput', () => {
  it('accepts a well-formed request (ISO startDate string)', () => {
    const before = Date.now();
    const parsed = CreateRentalRequestInput.parse(base());
    expect(parsed.durationMonths).toBe(12);
    // The string passes through unchanged (millisecond tolerance for the
    // base-vs-parse clock gap).
    expect(new Date(parsed.startDate).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(parsed.propertyId).toBe(uuid);
  });

  it('rejects malformed startDate strings', () => {
    expect(CreateRentalRequestInput.safeParse(base({ startDate: 'not-a-date' })).success).toBe(false);
    expect(CreateRentalRequestInput.safeParse(base({ startDate: '11-09-2026' })).success).toBe(false);
    expect(CreateRentalRequestInput.safeParse(base({ startDate: '2026-9-5' })).success).toBe(false);
  });

  it('accepts both date-only and full ISO datetime strings', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(
      CreateRentalRequestInput.safeParse({
        ...base(),
        startDate: new Date(Date.now() + 7 * day).toISOString().slice(0, 10),
      }).success,
    ).toBe(true);
    expect(CreateRentalRequestInput.safeParse(base({ startDate: validDate(7) })).success).toBe(true);
  });

  it('accepts today and the 90th day out, rejects the 91st and the past', () => {
    expect(CreateRentalRequestInput.safeParse(base({ startDate: validDate(0) })).success).toBe(true);
    expect(CreateRentalRequestInput.safeParse(base({ startDate: validDate(90) })).success).toBe(true);
    expect(CreateRentalRequestInput.safeParse(base({ startDate: validDate(91) })).success).toBe(false);
    expect(CreateRentalRequestInput.safeParse(base({ startDate: validDate(-1) })).success).toBe(false);
  });

  it('bounds message to 20–1000 chars', () => {
    expect(CreateRentalRequestInput.safeParse(base({ message: 'x'.repeat(19) })).success).toBe(false);
    expect(CreateRentalRequestInput.safeParse(base({ message: 'x'.repeat(20) })).success).toBe(true);
    expect(CreateRentalRequestInput.safeParse(base({ message: 'x'.repeat(1001) })).success).toBe(false);
  });

  it('bounds durationMonths to 1–36 integers', () => {
    expect(CreateRentalRequestInput.safeParse(base({ durationMonths: 0 })).success).toBe(false);
    expect(CreateRentalRequestInput.safeParse(base({ durationMonths: 1 })).success).toBe(true);
    expect(CreateRentalRequestInput.safeParse(base({ durationMonths: 36 })).success).toBe(true);
    expect(CreateRentalRequestInput.safeParse(base({ durationMonths: 37 })).success).toBe(false);
    expect(CreateRentalRequestInput.safeParse(base({ durationMonths: 6.5 })).success).toBe(false);
  });

  it('rejects non-uuid property ids', () => {
    expect(CreateRentalRequestInput.safeParse(base({ propertyId: 'not-a-uuid' })).success).toBe(false);
  });
});

describe('UpdateRentalRequestInput', () => {
  it('accepts the three role-gated transitions with an optional note', () => {
    for (const status of ['ACCEPTED', 'REJECTED', 'CANCELLED'] as const) {
      expect(UpdateRentalRequestInput.parse({ status }).status).toBe(status);
    }
    expect(UpdateRentalRequestInput.parse({ status: 'REJECTED', note: 'Boshqa tanlov' }).note).toBe('Boshqa tanlov');
  });

  it('rejects job-internal statuses and over-long notes', () => {
    expect(UpdateRentalRequestInput.safeParse({ status: 'PENDING' }).success).toBe(false);
    expect(UpdateRentalRequestInput.safeParse({ status: 'COMPLETED' }).success).toBe(false);
    expect(UpdateRentalRequestInput.safeParse({ status: 'EXPIRED' }).success).toBe(false);
    expect(UpdateRentalRequestInput.safeParse({ status: 'REJECTED', note: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('request status enums', () => {
  it('RequestStatus covers all six lifecycle statuses', () => {
    expect(RequestStatus.options).toEqual([
      'PENDING',
      'ACCEPTED',
      'REJECTED',
      'CANCELLED',
      'EXPIRED',
      'COMPLETED',
    ]);
  });

  it('MyRentalsTab is the four §26 views', () => {
    expect(MyRentalsTab.options).toEqual(['ACTIVE', 'PENDING', 'COMPLETED', 'CANCELLED']);
  });
});
