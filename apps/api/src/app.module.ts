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
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    PrismaModule,
    RedisModule,
    TokenModule,
    HealthModule,
    AuthModule,
    UsersModule,
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
