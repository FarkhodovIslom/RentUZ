import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';

/**
 * Thin in-app event bus (Phase 4 §1.1 item 5, minus the dependency): the
 * notifications stub subscribes to `rental_request.*` events here. Node's
 * EventEmitter keeps it dependency-free; Phase 6 can swap the internals
 * (e.g. @nestjs/event-emitter or Redis streams) without touching call sites.
 *
 * Listener errors are caught + logged so one bad subscriber can't break a
 * rental-accept transaction's post-commit path.
 */
export const RENTAL_REQUEST_EVENTS = [
  'rental_request.created',
  'rental_request.accepted',
  'rental_request.rejected',
  'rental_request.cancelled',
  'rental_request.completed',
  'rental_request.expired',
] as const;

export type RentalRequestEvent = (typeof RENTAL_REQUEST_EVENTS)[number];

/** All payloads carry the ids the notifications stub needs to enqueue. */
export interface RentalRequestEventPayload {
  requestId: string;
  tenantId: string;
  ownerId: string;
  propertyId: string;
  /** Auto-reject note when the owner accepted a competing request. */
  note?: string;
}

/** Phase 5 chat events — one emit path for REST and socket sends (§28). */
export const CONVERSATION_EVENTS = ['conversation.created', 'message.created'] as const;

export type ConversationEvent = (typeof CONVERSATION_EVENTS)[number];

export interface ConversationCreatedPayload {
  conversationId: string;
  propertyId: string;
  tenantId: string;
  ownerId: string;
}

export interface MessageCreatedPayload {
  /** ConversationDTO-shaped message row (senderId, text, attachments). */
  message: {
    id: string;
    conversationId: string;
    senderId: string;
    text: string;
    attachments: Array<{ key: string; mime: string; width: number; height: number; size: number }>;
    createdAt: Date;
  };
  conversationId: string;
  /** The other participant — notifications + user-room fanout target. */
  recipientId: string;
  senderId: string;
}

@Injectable()
export class EventBusService {
  private readonly emitter = new EventEmitter();
  private readonly logger = new Logger(EventBusService.name);

  constructor() {
    // Never let a listener throw bubble into emit() callers.
    this.emitter.setMaxListeners(50);
  }

  /** Rental-request lifecycle subscription (Phase 4; notifications stub). */
  onRentalRequest(event: RentalRequestEvent, handler: (payload: RentalRequestEventPayload) => void): void {
    this.emitter.on(event, handler);
  }

  /** Chat events subscription (Phase 5; realtime gateway + notifications). */
  onConversation(
    event: ConversationEvent,
    handler: (payload: ConversationCreatedPayload | MessageCreatedPayload) => void,
  ): void {
    this.emitter.on(event, handler as (...args: unknown[]) => void);
  }

  emit(event: RentalRequestEvent, payload: RentalRequestEventPayload): void;
  emit(event: ConversationEvent, payload: ConversationCreatedPayload | MessageCreatedPayload): void;
  emit(event: string, payload: unknown): void {
    for (const [, listener] of this.emitter.listeners(event).entries()) {
      try {
        (listener as (p: unknown) => void)(payload);
      } catch (error) {
        this.logger.error(
          `event listener failed (${event}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
