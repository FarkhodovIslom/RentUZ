import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { GlobalExceptionFilter } from './common/global-exception.filter.js';
import { ResponseEnvelopeInterceptor } from './common/response-envelope.interceptor.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RoleGuard } from './common/guards/role.guard.js';
import { SuspendedGuard } from './common/guards/suspended.guard.js';
import { ThrottleGuard } from './common/guards/throttle.guard.js';
import { validateEnv } from './config/env.js';
import { TokenModule } from './common/token.module.js';
import { EventBusModule } from './common/services/event-bus.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { PropertiesModule } from './modules/properties/properties.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { FavoritesModule } from './modules/favorites/favorites.module.js';
import { RentalRequestsModule } from './modules/rental-requests/rental-requests.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { JobsModule } from './modules/jobs/jobs.module.js';
import { ConversationsModule } from './modules/conversations/conversations.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    PrismaModule,
    RedisModule,
    TokenModule,
    EventBusModule,
    HealthModule,
    AuthModule,
    UsersModule,
    PropertiesModule,
    SearchModule,
    FavoritesModule,
    RentalRequestsModule,
    NotificationsModule,
    JobsModule,
    ConversationsModule,
    RealtimeModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    // Guard order: throttle (cheapest, Redis) → auth → suspension → roles.
    { provide: APP_GUARD, useClass: ThrottleGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: SuspendedGuard },
    { provide: APP_GUARD, useClass: RoleGuard },
  ],
})
export class AppModule {}
