import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { NotifType, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  EventBusService,
  type RentalRequestEventPayload,
} from '../../common/services/event-bus.service.js';

/**
 * Phase 4 notification stub (§1.1 item 6): enqueue writes rows; there are no
 * fetch endpoints or bell UI yet — Phase 6 builds the read surface on top.
 *
 * `NotifType` (Phase 1 enum) has REQUEST_NEW/ACCEPTED/REJECTED only, so
 * cancelled/completed/expired enqueue under the closest semantic type with
 * distinct `bodyKey`s; `data.status` carries the exact lifecycle state for
 * the Phase 6 UI.
 */
export interface EnqueueNotification {
  userId: string;
  type: NotifType;
  titleKey: string;
  bodyKey: string;
  data?: Record<string, string | number | boolean | null>;
}

const EVENT_TO_NOTIF: Record<
  string,
  { toUserId: keyof Pick<RentalRequestEventPayload, 'ownerId' | 'tenantId'>; type: NotifType; bodyKey: string }
> = {
  'rental_request.created': { toUserId: 'ownerId', type: 'REQUEST_NEW', bodyKey: 'request.new' },
  'rental_request.accepted': { toUserId: 'tenantId', type: 'REQUEST_ACCEPTED', bodyKey: 'request.accepted' },
  'rental_request.rejected': { toUserId: 'tenantId', type: 'REQUEST_REJECTED', bodyKey: 'request.rejected' },
  'rental_request.cancelled': { toUserId: 'ownerId', type: 'REQUEST_REJECTED', bodyKey: 'request.cancelled' },
  'rental_request.completed': { toUserId: 'tenantId', type: 'REQUEST_ACCEPTED', bodyKey: 'request.completed' },
  'rental_request.expired': { toUserId: 'tenantId', type: 'REQUEST_REJECTED', bodyKey: 'request.expired' },
};

const BASE_DATA: Record<string, unknown> = { context: 'rental_request' };

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
  ) {}

  /** Subscribe to every rental-request lifecycle event (§70). */
  onModuleInit(): void {
    for (const [event, mapping] of Object.entries(EVENT_TO_NOTIF)) {
      this.events.on(event as never, (payload: RentalRequestEventPayload) => {
        void this.enqueue({
          userId: payload[mapping.toUserId],
          type: mapping.type,
          titleKey: 'request.title',
          bodyKey: mapping.bodyKey,
          data: { ...BASE_DATA, ...payload },
        });
      });
    }
  }

  /** Fire-and-forget row insert; failures log but never break the caller. */
  async enqueue(notification: EnqueueNotification): Promise<void> {
    const data: Record<string, string | number | boolean | null> = {
      context: 'rental_request',
      ...notification.data,
    };
    try {
      await this.prisma.notifications.create({
        data: {
          userId: notification.userId,
          type: notification.type,
          titleKey: notification.titleKey,
          bodyKey: notification.bodyKey,
          data: data as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.logger.error(
        `enqueue failed (${notification.type}/${notification.bodyKey}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
