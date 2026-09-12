import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module.js';
import { AdminPropertiesController } from './admin-properties.controller.js';
import { AdminPropertiesService } from './admin-properties.service.js';

/** §59 admin property management (status actions + listing browser). */
@Module({
  imports: [SearchModule], // cache bump on every status transition
  controllers: [AdminPropertiesController],
  providers: [AdminPropertiesService],
})
export class AdminPropertiesModule {}
