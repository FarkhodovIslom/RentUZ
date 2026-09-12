import { describe, expect, it, vi } from 'vitest';
import { EventBusService, type RentalRequestEventPayload } from '../../common/services/event-bus.service.js';

describe('EventBusService', () => {
  it('delivers payloads to subscribers of the exact event', () => {
    const bus = new EventBusService();
    const created = vi.fn();
    const accepted = vi.fn();
    bus.onRentalRequest('rental_request.created', created);
    bus.onRentalRequest('rental_request.accepted', accepted);

    const payload: RentalRequestEventPayload = {
      requestId: 'r1',
      tenantId: 't1',
      ownerId: 'o1',
      propertyId: 'p1',
    };
    bus.emit('rental_request.created', payload);
    expect(created).toHaveBeenCalledWith(payload);
    expect(accepted).not.toHaveBeenCalled();
  });

  it('a throwing listener is logged and does not break the emit call site', () => {
    const bus = new EventBusService();
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    bus.onRentalRequest('rental_request.cancelled', bad);
    bus.onRentalRequest('rental_request.cancelled', good);

    expect(() =>
      bus.emit('rental_request.cancelled', {
        requestId: 'r1',
        tenantId: 't1',
        ownerId: 'o1',
        propertyId: 'p1',
      }),
    ).not.toThrow();
    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalled();
  });
});
