import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { NotifType } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  EventBusService,
  type PropertyEventPayload,
  type RentalRequestEventPayload,
} from '../../common/services/event-bus.service.js';
import { NotificationsService } from './notifications.service.js';

/**
 * §1.1.3 — every EventBus event mapped to one (or many) notification rows.
 * `data.key` is the idempotency key: a replayed event can never double-notify
 * the same user for the same domain fact. titleKey is per-type (i18n
 * contract test: every NotifType value has a `notifications.types.<camel>`
 * key); bodyKey carries the lifecycle nuance — the Phase 4 stub's approach
 * for cancelled/completed/expired sharing enum values stays (`data.status`
 * holds the exact state). `data.propertyTitle` / `data.actorName` enrich the
 * interpolation for the web body templates.
 */
type ReqMapping = {
  to: 'ownerId' | 'tenantId' | 'both';
  type: NotifType;
  bodyKey: string;
};

const REQUEST_MAPPINGS: Record<string, ReqMapping> = {
  'rental_request.created': { to: 'ownerId', type: 'REQUEST_NEW', bodyKey: 'request.new' },
  'rental_request.accepted': { to: 'tenantId', type: 'REQUEST_ACCEPTED', bodyKey: 'request.accepted' },
  'rental_request.rejected': { to: 'tenantId', type: 'REQUEST_REJECTED', bodyKey: 'request.rejected' },
  'rental_request.cancelled': { to: 'ownerId', type: 'REQUEST_REJECTED', bodyKey: 'request.cancelled' },
  'rental_request.completed': { to: 'both', type: 'REQUEST_ACCEPTED', bodyKey: 'request.completed' },
  'rental_request.expired': { to: 'tenantId', type: 'REQUEST_REJECTED', bodyKey: 'request.expired' },
};

export function camelNotifType(type: NotifType): string {
  return type.toLowerCase().replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
}

@Injectable()
export class NotificationListeners implements OnModuleInit {
  private readonly logger = new Logger(NotificationListeners.name);

  constructor(
    private readonly events: EventBusService,
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    // ── rental-request lifecycle (§70) ──
    for (const [event, mapping] of Object.entries(REQUEST_MAPPINGS)) {
      this.events.on(event as never, (payload: RentalRequestEventPayload) => {
        void this.enqueueRequestNotice(mapping, payload);
      });
    }

    // ── chat (Phase 5 MessagesService emits message.created) ──
    this.events.on('message.created', (payload) => {
      // Recipient only — the sender never gets notified about their own text.
      if (!payload.recipientId) return;
      void this.enqueueMessageNotice(payload);
    });

    // ── verification outcomes (§30) ──
    this.events.on('property.verified', (payload: PropertyEventPayload) => {
      void this.enqueueWithContext(
        {
          userId: payload.ownerId,
          type: 'PROPERTY_VERIFIED',
          bodyKey: 'property.verified',
          data: {
            key: `property:${payload.propertyId}:verified`,
            propertyId: payload.propertyId,
            context: 'property',
          },
        },
        payload.propertyId,
      );
    });
    this.events.on('property.rejected', (payload: PropertyEventPayload) => {
      void this.enqueueWithContext(
        {
          userId: payload.ownerId,
          type: 'PROPERTY_REJECTED',
          bodyKey: 'property.rejected',
          data: {
            key: `property:${payload.propertyId}:rejected`,
            propertyId: payload.propertyId,
            context: 'property',
            ...(payload.reason ? { reason: payload.reason } : {}),
          },
        },
        payload.propertyId,
      );
    });

    // ── price change → fan-out to favoriting users (§84: viewers NOT notified) ──
    this.events.on('property.price_changed', (payload: PropertyEventPayload) => {
      void this.fanOutPriceChange(payload);
    });
  }

  private async enqueueRequestNotice(mapping: ReqMapping, payload: RentalRequestEventPayload): Promise<void> {
    const targets =
      mapping.to === 'both'
        ? [payload.ownerId, payload.tenantId]
        : [payload[mapping.to]];
    const actorId = mapping.to === 'ownerId' ? payload.tenantId : payload.ownerId;
    const [propertyTitle, actorName] = await Promise.all([
      this.propertyTitle(payload.propertyId),
      this.userName(actorId),
    ]);
    for (const userId of new Set(targets)) {
      await this.notifications.enqueue({
        userId,
        type: mapping.type,
        titleKey: `notifications.types.${camelNotifType(mapping.type)}`,
        bodyKey: mapping.bodyKey,
        data: {
          key: `request:${payload.requestId}:${mapping.bodyKey}:${userId}`,
          requestId: payload.requestId,
          propertyId: payload.propertyId,
          context: 'rental_request',
          status: mapping.bodyKey.replace('request.', '').toUpperCase(),
          ...(propertyTitle ? { propertyTitle } : {}),
          ...(actorName ? { actorName } : {}),
          ...(payload.note ? { note: payload.note } : {}),
        },
      });
    }
  }

  private async enqueueMessageNotice(payload: {
    conversationId: string;
    senderId: string;
    recipientId: string;
    messageId: string;
    propertyId?: string;
  }): Promise<void> {
    const [senderName, propertyTitle] = await Promise.all([
      this.userName(payload.senderId),
      payload.propertyId ? this.propertyTitle(payload.propertyId) : Promise.resolve(null),
    ]);
    await this.notifications.enqueue({
      userId: payload.recipientId,
      type: 'NEW_MESSAGE',
      titleKey: 'notifications.types.newMessage',
      bodyKey: 'message.new',
      data: {
        key: `message:${payload.messageId}`,
        conversationId: payload.conversationId,
        ...(payload.propertyId ? { propertyId: payload.propertyId } : {}),
        ...(propertyTitle ? { propertyTitle } : {}),
        ...(senderName ? { actorName: senderName } : {}),
        context: 'conversation',
      },
    });
  }

  private async enqueueWithContext(
    notice: Omit<Parameters<NotificationsService['enqueue']>[0], 'titleKey'>,
    propertyId: string,
  ): Promise<void> {
    const title = await this.propertyTitle(propertyId);
    await this.notifications.enqueue({
      ...notice,
      titleKey: `notifications.types.${camelNotifType(notice.type)}`,
      data: { ...notice.data, ...(title ? { propertyTitle: title } : {}) },
    });
  }

  private async fanOutPriceChange(payload: PropertyEventPayload): Promise<void> {
    if (payload.oldPriceUzs === payload.newPriceUzs) return;
    try {
      const title = payload.title ?? (await this.propertyTitle(payload.propertyId));
      const fans = await this.prisma.favorites.findMany({
        where: { propertyId: payload.propertyId },
        select: { userId: true },
      });
      for (const { userId } of fans) {
        await this.notifications.enqueue({
          userId,
          type: 'PRICE_CHANGED',
          titleKey: 'notifications.types.priceChanged',
          bodyKey: 'price.changed',
          data: {
            key: `price:${payload.propertyId}:${payload.newPriceUzs ?? 'x'}`,
            propertyId: payload.propertyId,
            ...(title ? { propertyTitle: title } : {}),
            oldPriceUzs: payload.oldPriceUzs ?? null,
            newPriceUzs: payload.newPriceUzs ?? null,
            context: 'property',
          },
        });
      }
    } catch (error) {
      this.logger.error(
        `price-change fanout failed for ${payload.propertyId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async propertyTitle(propertyId: string): Promise<string | null> {
    try {
      const p = await this.prisma.properties.findUnique({
        where: { id: propertyId },
        select: { title: true },
      });
      return p?.title ?? null;
    } catch {
      return null;
    }
  }

  private async userName(userId: string): Promise<string | null> {
    try {
      const u = await this.prisma.users.findUnique({ where: { id: userId }, select: { name: true } });
      return u?.name ?? null;
    } catch {
      return null;
    }
  }
}
