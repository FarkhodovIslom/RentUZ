import { Global, Module } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service.js';

/**
 * Runtime feature flags (§5 settings page). Global like EventBus/Redis —
 * auth, properties and jobs all read flags without importing a module.
 */
@Global()
@Module({
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
