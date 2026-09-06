import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';
import type { Request } from 'express';
import { RedisService } from '../../redis/redis.service.js';
import { THROTTLE_KEY, type ThrottleOptions } from '../decorators/throttle.decorator.js';

/**
 * Distributed rate limiting on Redis (replaces @nestjs/throttler —
 * 0_Phase.md §1 trap 2). Reads @Throttle() metadata per route; the guard
 * applies an instance per policy name, keyed by user id or IP.
 */
@Injectable()
export class ThrottleGuard implements CanActivate {
  private readonly limiters = new Map<string, RateLimiterRedis>();

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  private getLimiter(opts: ThrottleOptions): RateLimiterRedis {
    let limiter = this.limiters.get(opts.key);
    if (!limiter) {
      limiter = new RateLimiterRedis({
        storeClient: this.redis.client,
        keyPrefix: `rl:${opts.key}`,
        points: opts.points,
        duration: opts.duration,
        blockDuration: opts.blockDuration ?? 0,
        // ioredis errors must not fail the request — fall back to in-process
        // limiting instead of throwing.
        insuranceLimiter: new RateLimiterMemory({
          keyPrefix: `rl-mem:${opts.key}`,
          points: opts.points,
          duration: opts.duration,
        }),
      });
      this.limiters.set(opts.key, limiter);
    }
    return limiter;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Tests exercise flows that legitimately exceed per-route limits (e.g. 10
    // failed logins for the lockout case) — an env flag disables the limiter.
    if (process.env.DISABLE_THROTTLE === 'true') return true;

    const opts = this.reflector.getAllAndOverride<ThrottleOptions>(THROTTLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!opts) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: { id: string } }>();
    const identity = request.user?.id ?? request.ip ?? 'unknown';
    const limiter = this.getLimiter(opts);
    try {
      await limiter.consume(identity);
    } catch (rej) {
      const rejObj = rej as { msBeforeNext?: number };
      const retryAfter = Math.ceil((rejObj.msBeforeNext ?? 0) / 1000);
      throw new HttpException(
        {
          success: false,
          message: 'Too many requests',
          error: { code: 'RATE_LIMITED' },
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
