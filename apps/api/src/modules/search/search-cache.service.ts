import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service.js';

/** Redis version-key for cache invalidation (3_Phase.md §1.2, Redis variant):
 *  every property lifecycle transition INCRs this key; cache keys embed the
 *  version, so a bump orphans all previous entries (TTL sweeps them). This
 *  works across API instances behind a load balancer — no event bus needed. */
export const SEARCH_CACHE_VERSION_KEY = 'search:cache:ver';

/** Deterministic serialization: object keys sorted recursively, undefined dropped. */
export function normalizeParams(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeParams);
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) sorted[key] = normalizeParams(v);
    }
    return sorted;
  }
  return value;
}

export function cacheKeyHash(params: unknown): string {
  return createHash('sha1')
    .update(JSON.stringify(normalizeParams(params)))
    .digest('hex')
    .slice(0, 20);
}

@Injectable()
export class SearchCacheService {
  constructor(private readonly redis: RedisService) {}

  /** Cache a loader's result under `search:{namespace}:{version}:{hash}`. */
  async wrap<T>(
    namespace: 'list' | 'map' | 'featured' | 'cities',
    params: unknown,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const version = (await this.redis.client.get(SEARCH_CACHE_VERSION_KEY).catch(() => null)) ?? '0';
    const key = `search:${namespace}:${version}:${cacheKeyHash(params)}`;
    const cached = await this.redis.client.get(key).catch(() => null);
    if (cached) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        // Corrupt entry — fall through to a fresh load.
      }
    }
    const fresh = await loader();
    await this.redis.client.set(key, JSON.stringify(fresh), 'EX', ttlSeconds).catch(() => undefined);
    return fresh;
  }

  /** Bump the version — called after every property lifecycle transition. */
  async bumpVersion(): Promise<void> {
    await this.redis.client.incr(SEARCH_CACHE_VERSION_KEY).catch(() => undefined);
  }
}
