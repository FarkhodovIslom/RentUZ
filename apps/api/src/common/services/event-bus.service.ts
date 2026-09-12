import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';

/**
 * Thin in-app event bus (Phase 4 §1.1 item 5; Phase 6 §1.1.3 grows the
 * vocabulary). Node's EventEmitter keeps it dependency-free; the notification
 * listeners are the only subscribers today.
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
 * Phase 5 (chat) emits `message.created` from MessagesService after a message
 * row lands. Kept minimal + structural here so Phase 6 compiles on main and
 * merges cleanly: the listener only needs the three ids.
 */
export const MESSAGE_EVENTS = ['message.created'] as const;

export type MessageEvent = (typeof MESSAGE_EVENTS)[number];

export interface MessageCreatedPayload {
  conversationId: string;
  senderId: string;
  recipientId: string;
  messageId: string;
  propertyId?: string;
}

/** Event → payload map; on()/emit() are keyed off it. */
export type BusEventPayloads = {
  [E in RentalRequestEvent | PropertyEvent | MessageEvent]: E extends RentalRequestEvent
    ? RentalRequestEventPayload
    : E extends PropertyEvent
      ? PropertyEventPayload
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
