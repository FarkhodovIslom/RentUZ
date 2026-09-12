import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';

/**
 * Thin in-app event bus (Phase 4 §1.1 item 5; Phase 6 §1.1.3 grows the
 * vocabulary; Phase 5 adds chat events). Node's EventEmitter keeps it
 * dependency-free; the notification listeners and the realtime gateway are
 * the subscribers today.
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

/**
 * §30/§84 — listing lifecycle signals Phase 6 starts emitting: verification
 * outcome for the owner and price changes (fan-out to favoriting users).
 * `priceUzs` are plain numbers (BigInt never crosses the bus).
 */
export const PROPERTY_EVENTS = [
  'property.verified',
  'property.rejected',
  'property.price_changed',
] as const;

export type PropertyEvent = (typeof PROPERTY_EVENTS)[number];

export interface PropertyEventPayload {
  propertyId: string;
  ownerId: string;
  title?: string;
  oldPriceUzs?: number;
  newPriceUzs?: number;
  /** ADMIN rejection note (§30) — surfaced in the notification body. */
  reason?: string;
}

/**
 * Phase 5 (chat): MessagesService emits `message.created` after the row
 * lands (persist-then-emit, §28). Flat ids serve the notification listener;
 * `message` carries the row the gateway fans out as `message:new`.
 */
export const MESSAGE_EVENTS = ['message.created'] as const;

export type MessageEvent = (typeof MESSAGE_EVENTS)[number];

export interface MessageCreatedPayload {
  conversationId: string;
  senderId: string;
  recipientId: string;
  messageId: string;
  propertyId?: string;
  /** Full row for realtime delivery (attachment keys, not signed URLs). */
  message: {
    id: string;
    conversationId: string;
    senderId: string;
    text: string;
    attachments: Array<{ key: string; mime: string; width: number; height: number; size: number }>;
    createdAt: Date;
  };
}

/** Phase 5 chat — one conversation per (property, tenant, owner) triple (§28). */
export const CONVERSATION_EVENTS = ['conversation.created'] as const;

export type ConversationEvent = (typeof CONVERSATION_EVENTS)[number];

export interface ConversationCreatedPayload {
  conversationId: string;
  propertyId: string;
  tenantId: string;
  ownerId: string;
}

/**
 * Phase 7 (verification §60): admin asks the owner for more info — the
 * property stays in the queue, the owner gets a VERIFICATION_INFO_REQUESTED
 * notification carrying the admin's message.
 */
export const VERIFICATION_INFO_EVENTS = ['verification.info_requested'] as const;

export type VerificationInfoEvent = (typeof VERIFICATION_INFO_EVENTS)[number];

export interface VerificationInfoPayload {
  propertyId: string;
  ownerId: string;
  title?: string;
  /** Admin's request text (becomes the notification body). */
  message: string;
}

/** Event → payload map; on()/emit() are keyed off it. */
export type BusEventPayloads = {
  [E in
    | RentalRequestEvent
    | PropertyEvent
    | MessageEvent
    | ConversationEvent
    | VerificationInfoEvent]: E extends RentalRequestEvent
    ? RentalRequestEventPayload
    : E extends PropertyEvent
      ? PropertyEventPayload
      : E extends ConversationEvent
        ? ConversationCreatedPayload
        : E extends VerificationInfoEvent
          ? VerificationInfoPayload
          : MessageCreatedPayload;
};

@Injectable()
export class EventBusService {
  private readonly emitter = new EventEmitter();
  private readonly logger = new Logger(EventBusService.name);

  constructor() {
    // Never let a listener throw bubble into emit() callers.
    this.emitter.setMaxListeners(50);
  }

  on<E extends keyof BusEventPayloads>(event: E, handler: (payload: BusEventPayloads[E]) => void): void {
    this.emitter.on(event, handler as (payload: unknown) => void);
  }

  emit<E extends keyof BusEventPayloads>(event: E, payload: BusEventPayloads[E]): void {
    for (const [, listener] of this.emitter.listeners(event).entries()) {
      try {
        (listener as (p: BusEventPayloads[E]) => void)(payload);
      } catch (error) {
        this.logger.error(
          `event listener failed (${event}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
