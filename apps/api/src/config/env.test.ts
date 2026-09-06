import { describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from 'argon2';
import { envSchema, validateEnv } from './env.js';

describe('env validation', () => {
  it('applies development defaults', () => {
    const env = envSchema.parse({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.JWT_ACCESS_TTL).toBe('15m');
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(30);
    expect(env.COOKIE_SECURE).toBe(false);
  });

  it('coerces PORT and parses boolean flags', () => {
    const env = envSchema.parse({ PORT: '4000', AUTH_OTP_DEV_MODE: 'false' });
    expect(env.PORT).toBe(4000);
    expect(env.AUTH_OTP_DEV_MODE).toBe(false);
  });

  it('rejects invalid values', () => {
    expect(() => envSchema.parse({ NODE_ENV: 'staging' })).toThrow();
    expect(() => envSchema.parse({ PORT: '70000' })).toThrow();
    expect(() => envSchema.parse({ LOG_LEVEL: 'verbose' })).toThrow();
  });
});

describe('production assertions (AGENTS.md locked constraint)', () => {
  it('rejects the dev JWT secret placeholder in production', () => {
    expect(() =>
      validateEnv({ NODE_ENV: 'production', JWT_ACCESS_SECRET: 'phase0-dev-secret-change-me' }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects short secrets in production', () => {
    expect(() =>
      validateEnv({ NODE_ENV: 'production', JWT_ACCESS_SECRET: 'short', SOCKET_TICKET_SECRET: 'x' }),
    ).toThrow();
  });

  it('rejects AUTH_OTP_DEV_MODE in production', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'a'.repeat(32),
        SOCKET_TICKET_SECRET: 'b'.repeat(32),
        AUTH_OTP_DEV_MODE: 'true',
      }),
    ).toThrow(/AUTH_OTP_DEV_MODE/);
  });

  it('rejects AUTO_APPROVE_LISTINGS in production', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'a'.repeat(32),
        SOCKET_TICKET_SECRET: 'b'.repeat(32),
        AUTH_OTP_DEV_MODE: 'false',
        AUTO_APPROVE_LISTINGS: 'true',
      }),
    ).toThrow(/AUTO_APPROVE_LISTINGS/);
  });

  it('accepts a fully configured production env', () => {
    const env = validateEnv({
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      SOCKET_TICKET_SECRET: 'b'.repeat(32),
      AUTH_OTP_DEV_MODE: 'false',
      AUTO_APPROVE_LISTINGS: 'false',
      COOKIE_SECURE: 'true',
    });
    expect(env.NODE_ENV).toBe('production');
    expect(env.COOKIE_SECURE).toBe(true);
  });
});

describe('password hashing (argon2id)', () => {
  it('hashes and verifies', async () => {
    const password = 'paroltest12345';
    const passwordHash = await hash(password, { type: 2 });
    expect(passwordHash).not.toContain(password);
    expect(await verify(passwordHash, password)).toBe(true);
    expect(await verify(passwordHash, 'wrong-password-1')).toBe(false);
  });
});

describe('refresh token shape', () => {
  it('produces url-safe opaque tokens and sha256 hashing', () => {
    const raw = randomBytes(48).toString('base64url');
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    const digest = createHash('sha256').update(raw).digest('hex');
    expect(digest).toHaveLength(64);
  });
});
