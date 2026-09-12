import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service.js';

function makeService() {
  // Minimal in-memory Redis stand-in so set()→get() round-trips.
  const store = new Map<string, string>();
  const redis = {
    client: {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
      }),
    },
  };
  const svc = new FeatureFlagsService(redis as never);
  return { svc, redis, store };
}

describe('FeatureFlagsService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.AUTO_APPROVE_LISTINGS = 'true';
    delete process.env.NOTIFICATIONS_READ_RETENTION_DAYS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('reads the env default when no override exists', async () => {
    const { svc, redis } = makeService();
    expect(await svc.get('AUTO_APPROVE_LISTINGS')).toBe(true);
    expect(await svc.get('NOTIFICATIONS_READ_RETENTION_DAYS')).toBe(90);
    expect(redis.client.get).toHaveBeenCalled();
  });

  it('an override beats the env default and is written to Redis', async () => {
    const { svc, redis } = makeService();
    await svc.set('AUTO_APPROVE_LISTINGS', false);
    expect(redis.client.set).toHaveBeenCalledWith('flags:runtime:AUTO_APPROVE_LISTINGS', 'false');
    expect(await svc.get('AUTO_APPROVE_LISTINGS')).toBe(false);
  });

  it('caches the resolved value for 5 s (one Redis read per window)', async () => {
    vi.useFakeTimers();
    const { svc, redis } = makeService();
    redis.client.get.mockResolvedValue('false');

    await svc.get('AUTO_APPROVE_LISTINGS');
    await svc.get('AUTO_APPROVE_LISTINGS');
    expect(redis.client.get).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5_001);
    await svc.get('AUTO_APPROVE_LISTINGS');
    expect(redis.client.get).toHaveBeenCalledTimes(2);
  });

  it('set() invalidates the cache for this instance immediately', async () => {
    vi.useFakeTimers();
    const { svc, redis } = makeService();
    redis.client.get.mockResolvedValue(null); // env default true
    expect(await svc.get('AUTO_APPROVE_LISTINGS')).toBe(true);

    redis.client.get.mockResolvedValue('false');
    await svc.set('AUTO_APPROVE_LISTINGS', false);
    expect(await svc.get('AUTO_APPROVE_LISTINGS')).toBe(false);
  });

  it('hard-clamps the dev flags to false in production', async () => {
    const { svc, redis } = makeService();
    process.env.NODE_ENV = 'production';
    redis.client.get.mockResolvedValue('true'); // malicious/stale override
    expect(await svc.get('AUTO_APPROVE_LISTINGS')).toBe(false);
    expect(await svc.get('AUTH_OTP_DEV_MODE')).toBe(false);
  });

  it('refuses enabling a production-locked flag in production', async () => {
    const { svc } = makeService();
    process.env.NODE_ENV = 'production';
    await expect(svc.set('AUTO_APPROVE_LISTINGS', true)).rejects.toBeInstanceOf(ConflictException);
  });

  it('falls back to the env default when Redis errors', async () => {
    const { svc, redis } = makeService();
    redis.client.get.mockRejectedValue(new Error('redis down'));
    expect(await svc.get('AUTO_APPROVE_LISTINGS')).toBe(true);
  });
});
