import { Module } from '@nestjs/common';
import { PropertiesModule } from '../properties/properties.module.js';
import { SearchModule } from '../search/search.module.js';
import {
  OwnerRentalRequestsController,
  RentalRequestsController,
} from './rental-requests.controller.js';
import { RentalRequestsService } from './rental-requests.service.js';
import { RentalLifecycleService } from './rental-lifecycle.service.js';

/**
 * §44 rental requests. FxService + SearchCacheService come via Properties/
 * Search module imports (Prisma/Redis/EventBus are @Global).
 */
@Module({
  imports: [PropertiesModule, SearchModule],
  controllers: [RentalRequestsController, OwnerRentalRequestsController],
  providers: [RentalRequestsService, RentalLifecycleService],
  exports: [RentalRequestsService, RentalLifecycleService],
})
export class RentalRequestsModule {}
