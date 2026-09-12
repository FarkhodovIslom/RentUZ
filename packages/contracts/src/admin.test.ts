import { describe, expect, it } from 'vitest';
import {
  AuditListQuery,
  BulkSuspendBody,
  FeatureFlagUpdate,
  RejectReason,
  SetPropertyStatusBody,
  SuspendBody,
  VerificationQueueQuery,
} from './admin.js';

const uuid = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

describe('RejectReason', () => {
  it('enforces the 10–500 char window', () => {
    expect(RejectReason.safeParse('qisqa').success).toBe(false);
    expect(RejectReason.safeParse('a'.repeat(10)).success).toBe(true);
    expect(RejectReason.safeParse('a'.repeat(501)).success).toBe(false);
  });
});

describe('SuspendBody / SetPropertyStatusBody', () => {
  it('accepts the user status set', () => {
    expect(SuspendBody.safeParse({ status: 'SUSPENDED', reason: 'sababi yetarli' }).success).toBe(true);
    expect(SuspendBody.safeParse({ status: 'DELETED' }).success).toBe(true);
    expect(SuspendBody.safeParse({ status: 'NOPE' }).success).toBe(false);
  });

  it('accepts only the four admin property transitions', () => {
    for (const status of ['ACTIVE', 'PAUSED', 'REJECTED', 'DELETED'] as const) {
      expect(SetPropertyStatusBody.safeParse({ status }).success).toBe(true);
    }
    expect(SetPropertyStatusBody.safeParse({ status: 'DRAFT' }).success).toBe(false);
  });
});

describe('FeatureFlagUpdate (Phase 6 names)', () => {
  it('accepts the boolean dev flags and the retention day ranges', () => {
    const parsed = FeatureFlagUpdate.parse({
      AUTO_APPROVE_LISTINGS: false,
      AUTH_OTP_DEV_MODE: true,
      CHAT_ATTACHMENT_TTL_DAYS: 30,
      NOTIFICATIONS_READ_RETENTION_DAYS: 90,
      NOTIFICATIONS_UNREAD_RETENTION_DAYS: 30,
    });
    expect(parsed.NOTIFICATIONS_READ_RETENTION_DAYS).toBe(90);
  });

  it('rejects out-of-range day values', () => {
    expect(FeatureFlagUpdate.safeParse({ NOTIFICATIONS_READ_RETENTION_DAYS: 0 }).success).toBe(false);
    expect(FeatureFlagUpdate.safeParse({ CHAT_ATTACHMENT_TTL_DAYS: 999 }).success).toBe(false);
  });
});

describe('BulkSuspendBody / list queries', () => {
  it('caps bulk suspend at 100 users and requires a reason', () => {
    const userIds = Array.from({ length: 101 }, () => uuid);
    expect(BulkSuspendBody.safeParse({ userIds, reason: 'sabab yetarlicha' }).success).toBe(false);
    expect(BulkSuspendBody.safeParse({ userIds: [uuid], reason: 'sabab yetarlicha' }).success).toBe(true);
  });

  it('defaults the verification queue to PENDING with limit 20', () => {
    const parsed = VerificationQueueQuery.parse({});
    expect(parsed.status).toBe('PENDING');
    expect(parsed.limit).toBe(20);
  });

  it('audit query accepts an empty filter set', () => {
    const parsed = AuditListQuery.parse({});
    expect(parsed.limit).toBe(20);
  });
});
