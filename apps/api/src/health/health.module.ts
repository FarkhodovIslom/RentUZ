import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { MetricsController } from './metrics.controller.js';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsInterceptor } from '../common/interceptors/metrics.interceptor.js';

@Module({
  controllers: [HealthController, MetricsController],
  providers: [
    MetricsController, // shared instruments for the interceptor (DI)
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
  exports: [MetricsController],
})
export class HealthModule {}
