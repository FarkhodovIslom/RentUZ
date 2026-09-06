import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { RedisService } from '../redis/redis.service.js';

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Liveness — process is up. Never touches infra. */
  @Get('health')
  health() {
    return { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() };
  }

  /** Readiness — DB reachable, Redis reachable. Render health-check path. */
  @Get('ready')
  async ready() {
    const checks: Record<string, 'ok' | 'fail'> = { database: 'ok', redis: 'ok' };
    try {
      await withTimeout(this.prisma.ping(), 1500, 'database');
    } catch {
      checks.database = 'fail';
    }
    try {
      await withTimeout(this.redis.ping(), 1500, 'redis');
    } catch {
      checks.redis = 'fail';
    }
    if (Object.values(checks).some((v) => v === 'fail')) {
      throw new ServiceUnavailableException({ checks });
    }
    return { status: 'ok', checks };
  }
}
