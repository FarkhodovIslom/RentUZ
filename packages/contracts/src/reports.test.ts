import { describe, expect, it } from 'vitest';
import {
  ReportCreateInput,
  ReportResolveBody,
  deriveReportPriority,
} from './reports.js';

const uuid = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

describe('deriveReportPriority (§61)', () => {
  it('SCAM/FAKE/DUPLICATE → HIGH', () => {
    expect(deriveReportPriority('SCAM')).toBe('HIGH');
    expect(deriveReportPriority('FAKE')).toBe('HIGH');
    expect(deriveReportPriority('DUPLICATE')).toBe('HIGH');
  });

  it('WRONG_PRICE/WRONG_LOCATION → MEDIUM', () => {
    expect(deriveReportPriority('WRONG_PRICE')).toBe('MEDIUM');
    expect(deriveReportPriority('WRONG_LOCATION')).toBe('MEDIUM');
  });

  it('INAPPROPRIATE/OTHER → LOW', () => {
    expect(deriveReportPriority('INAPPROPRIATE')).toBe('LOW');
    expect(deriveReportPriority('OTHER')).toBe('LOW');
  });
});

describe('ReportCreateInput', () => {
  it('accepts a minimal report', () => {
    const parsed = ReportCreateInput.parse({ targetType: 'PROPERTY', targetId: uuid, reason: 'SCAM' });
    expect(parsed.reason).toBe('SCAM');
  });

  it('caps evidence at 5 items', () => {
    const evidence = Array.from({ length: 6 }, (_, i) => ({ kind: 'text' as const, ref: `ref-${i}` }));
    expect(ReportCreateInput.safeParse({ targetType: 'USER', targetId: uuid, reason: 'OTHER', evidence }).success).toBe(false);
    expect(
      ReportCreateInput.safeParse({ targetType: 'USER', targetId: uuid, reason: 'OTHER', evidence: evidence.slice(0, 5) })
        .success,
    ).toBe(true);
  });

  it('rejects an unknown reason', () => {
    expect(ReportCreateInput.safeParse({ targetType: 'USER', targetId: uuid, reason: 'NOPE' }).success).toBe(false);
  });
});

describe('ReportResolveBody', () => {
  it('REJECTED requires a note of at least 10 chars', () => {
    expect(ReportResolveBody.safeParse({ action: 'REJECTED' }).success).toBe(false);
    expect(ReportResolveBody.safeParse({ action: 'REJECTED', note: 'qisqa' }).success).toBe(false);
    expect(ReportResolveBody.safeParse({ action: 'REJECTED', note: 'yetarlicha uzun izoh' }).success).toBe(true);
  });

  it('RESOLVED note stays optional', () => {
    expect(ReportResolveBody.safeParse({ action: 'RESOLVED' }).success).toBe(true);
  });

  it('ESCALATED needs no note', () => {
    expect(ReportResolveBody.safeParse({ action: 'ESCALATED' }).success).toBe(true);
  });
});
