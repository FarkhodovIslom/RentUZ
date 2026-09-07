import { describe, expect, it } from 'vitest';
import { PropertyStatusService } from './status.service.js';

describe('PropertyStatusService', () => {
  const svc = new PropertyStatusService();

  const legal: Array<[string, string]> = [
    ['DRAFT', 'PENDING_VERIFICATION'],
    ['DRAFT', 'ACTIVE'],
    ['PENDING_VERIFICATION', 'ACTIVE'],
    ['PENDING_VERIFICATION', 'REJECTED'],
    ['ACTIVE', 'PAUSED'],
    ['ACTIVE', 'RENTED'],
    ['RENTED', 'ACTIVE'],
    ['PAUSED', 'ACTIVE'],
    ['ACTIVE', 'DELETED'],
    ['DRAFT', 'DELETED'],
  ];

  it.each(legal)('allows %s → %s', (from, to) => {
    expect(() => svc.assert(from as never, to as never)).not.toThrow();
  });

  const illegal: Array<[string, string]> = [
    ['DRAFT', 'RENTED'],
    ['DRAFT', 'PAUSED'],
    ['DRAFT', 'REJECTED'],
    ['PENDING_VERIFICATION', 'PAUSED'],
    ['PENDING_VERIFICATION', 'RENTED'],
    ['PAUSED', 'PENDING_VERIFICATION'],
    ['PAUSED', 'REJECTED'],
    ['RENTED', 'RENTED'],
    ['REJECTED', 'ACTIVE'],
    ['DELETED', 'DRAFT'],
    ['ACTIVE', 'PENDING_VERIFICATION'],
  ];

  it.each(illegal)('rejects %s → %s', (from, to) => {
    if (from === to) return; // same-state is a no-op
    expect(() => svc.assert(from as never, to as never)).toThrow(/mumkin emas/);
  });

  it('is a no-op for same-state transitions', () => {
    expect(() => svc.assert('ACTIVE', 'ACTIVE')).not.toThrow();
  });
});
