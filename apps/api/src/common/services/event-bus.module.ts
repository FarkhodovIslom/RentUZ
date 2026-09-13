import { Global, Module } from '@nestjs/common';
import { EventBusService } from './event-bus.service.js';
import { WebRevalidateService } from './web-revalidate.service.js';

/**
 * The event bus is consumed across feature modules (rental-requests emits,
 * notifications subscribes) — keep it @Global so DI resolves everywhere,
 * mirroring TokenModule's rationale. WebRevalidateService registers itself
 * as a property.* listener at construction (Phase 8 ISR hook).
 */
@Global()
@Module({
  providers: [EventBusService, WebRevalidateService],
  exports: [EventBusService],
})
export class EventBusModule {}
