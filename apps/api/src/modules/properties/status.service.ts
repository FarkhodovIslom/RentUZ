import { ConflictException, Injectable } from '@nestjs/common';
import type { PropertyStatus } from '../../generated/prisma/enums.js';

/** Spec §33, §85: legal property status transitions. */
@Injectable()
export class PropertyStatusService {
  private readonly transitions: Record<PropertyStatus, PropertyStatus[]> = {
    DRAFT: ['PENDING_VERIFICATION', 'ACTIVE', 'DELETED'],
    PENDING_VERIFICATION: ['ACTIVE', 'REJECTED', 'DELETED'],
    ACTIVE: ['PAUSED', 'RENTED', 'DELETED'],
    PAUSED: ['ACTIVE', 'DELETED'],
    RENTED: ['ACTIVE', 'DELETED'], // ACTIVE when a rental completes (Phase 4 job)
    REJECTED: ['DELETED'],
    DELETED: [],
  };

  assert(from: PropertyStatus, to: PropertyStatus): void {
    if (from === to) return;
    const allowed = this.transitions[from] ?? [];
    if (!allowed.includes(to)) {
      throw new ConflictException({ code: 'CONFLICT', message: `${from} → ${to} mumkin emas` });
    }
  }
}
