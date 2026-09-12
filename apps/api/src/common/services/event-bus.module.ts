import { Global, Module } from '@nestjs/common';
import { EventBusService } from './event-bus.service.js';

/**
 * The event bus is consumed across feature modules (rental-requests emits,
 * notifications subscribes) — keep it @Global so DI resolves everywhere,
 * mirroring TokenModule's rationale.
 */
@Global()
@Module({
  providers: [EventBusService],
  exports: [EventBusService],
})
export class EventBusModule {}
