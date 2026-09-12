import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuthResult, SafeUser } from './auth.service.js';

/**
 * Auth flows that don't need a live DB are covered here with a stub Prisma
 * client. Full register→verify→login→refresh→logout runs against real
 * Postgres/Redis in test/auth-flows.integration.test.ts.
 */

type TokensRow = { id: string; tokenHash: string; family: string; revokedAt: Date | null; expiresAt: Date };

function makeUser(overrides: Partial<SafeUser> = {}): SafeUser {
  return {
    id: 'user-1',
    name: 'Test',
    phone: '+998901112233',
    email: null,
    avatar: null,
    role: 'USER',
    status: 'ACTIVE',
    isPhoneVerified: false,
    canListProperties: false,
    createdAt: new Date(),
    ...overrides,
  };
}

/** In-memory token store emulating refreshTokens operations used by AuthService. */
class TokenStore {
  rows: TokensRow[] = [];

  findFirst(args: Prisma.refreshTokensFindFirstArgs): TokensRow | null {
    const where = args.where as { tokenHash?: string; family?: string; revokedAt?: unknown };
    return (
      this.rows.find(
        (r) =>
          (!where.tokenHash || r.tokenHash === where.tokenHash) &&
          (!where.family || r.family === where.family),
      ) ?? null
    );
  }

  updateMany(args: Prisma.refreshTokensUpdateArgs): { count: number } {
    let count = 0;
    for (const r of this.rows) {
      const w = args.where as { family?: string; userId?: string; revokedAt?: { equals: null } };
      if (
        (!w.family || r.family === w.family) &&
        (!w.userId || r.family === this.familyOf(w.userId)) &&
        (!w.revokedAt || r.revokedAt === null)
      ) {
        r.revokedAt = args.data.revokedAt as Date;
        count++;
      }
    }
    return { count };
  }

  private familyOf(userId: string): string {
    return this.rows.find((r) => r.tokenHash.startsWith(userId.slice(0, 4)))?.family ?? 'none';
  }
}

// The service imports are resolved through the swc build at test time via
// vitest's TS pipeline; we instantiate through a helper to avoid DI.
async function makeService(store: TokenStore, otpStore: { code: string; consumed: boolean; attempts: number }[]) {
  const { AuthService } = await import('./auth.service.js');
  const prisma = {
    users: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    refreshTokens: {
      findFirst: vi.fn(args => store.findFirst(args)),
      create: vi.fn(args => {
        store.rows.push(args.data as TokensRow & { data: never });
      }),
      update: vi.fn(args => {
        // update(where: { id }, data) and updateMany(where, data)
        if (args.where && 'id' in args.where) {
          const row = store.rows.find(r => r.id === args.where.id);
          if (row) Object.assign(row, args.data);
          return row;
        }
        return store.updateMany(args);
      }),
      updateMany: vi.fn(args => store.updateMany(args)),
    },
    phoneVerifications: {
      findFirst: vi.fn(),
      create: vi.fn(args => otpStore.push({ code: args.data.codeHash, consumed: false, attempts: 0 })),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const redis = { client: { get: vi.fn(), set: vi.fn(), del: vi.fn(), ttl: vi.fn(), multi: vi.fn(() => ({ incr: vi.fn(), expire: vi.fn(), exec: vi.fn() })) } };
  const passwords = {
    hash: vi.fn(async (p: string) => `hashed:${p}`),
    verify: vi.fn(async (h: string, p: string) => h === `hashed:${p}`),
  };
  const tokens = {
    signAccessToken: vi.fn(() => 'access-token'),
    verifyAccessToken: vi.fn(),
    signSocketTicket: vi.fn(),
    verifySocketTicket: vi.fn(),
  };
  const sent: { to: string; code: string }[] = [];
  const sms = { send: vi.fn(async (p: { to: string; code: string }) => sent.push(p)) };
  const flags = { get: vi.fn(async () => process.env.AUTH_OTP_DEV_MODE === 'true') };

  const service = new AuthService(
    prisma as never,
    redis as never,
    passwords as never,
    tokens as never,
    flags as never,
    sms as never,
  );
  return { service, prisma, otpStore, sent };
}

describe('AuthService.refresh — rotation + reuse detection', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('revokes the whole family when a revoked token is replayed', async () => {
    const store = new TokenStore();
    store.rows.push(
      { id: 't1', tokenHash: 'old', family: 'fam-1', revokedAt: new Date(), expiresAt: new Date(Date.now() + 86400000) },
      { id: 't2', tokenHash: 'rotated', family: 'fam-1', revokedAt: null, expiresAt: new Date(Date.now() + 86400000) },
    );
    const { service, prisma } = await makeService(store, []);
    (prisma.refreshTokens.findFirst as ReturnType<typeof vi.fn>).mockImplementation(
      (_args: Prisma.refreshTokensFindFirstArgs) => ({
        tokenHash: 'old',
        family: 'fam-1',
        revokedAt: new Date(),
        user: makeUser(),
      }),
    );
    const updateMany = prisma.refreshTokens.updateMany as ReturnType<typeof vi.fn>;
    updateMany.mockImplementation((args: Prisma.refreshTokensUpdateManyArgs) => {
      // family revoke
      expect((args.where as { family: string }).family).toBe('fam-1');
      return { count: 2 };
    });

    await expect(service.refresh('old', {})).rejects.toThrow();
    expect(updateMany).toHaveBeenCalled();
  });

  it('rotates: old token revoked, new issued in the same family', async () => {
    const store = new TokenStore();
    const { service, prisma } = await makeService(store, []);
    (prisma.refreshTokens.findFirst as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      tokenHash: 'valid',
      family: 'fam-2',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
      user: makeUser(),
    }));
    const update = prisma.refreshTokens.update as ReturnType<typeof vi.fn>;
    update.mockImplementation((args: { where: { id: string }; data: { revokedAt: Date } }) => {
      expect(args.data.revokedAt).toBeInstanceOf(Date);
      return { id: args.where.id };
    });
    (prisma.refreshTokens.create as ReturnType<typeof vi.fn>).mockImplementation((args: { data: { family: string } }) => {
      expect(args.data.family).toBe('fam-2'); // same family
      return {};
    });

    const result: AuthResult = await service.refresh('valid', {});
    expect(result.accessToken).toBe('access-token');
    expect(typeof result.refreshToken).toBe('string');
    expect(update).toHaveBeenCalled();
  });
});

describe('AuthService OTP hashing', () => {
  it('hashes codes with sha256 before storage', async () => {
    process.env.AUTH_OTP_DEV_MODE = 'true';
    process.env.NODE_ENV = 'test';
    const { service, prisma, sent } = await makeService(new TokenStore(), []);
    (prisma.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' });
    (prisma.users.create as ReturnType<typeof vi.fn>).mockResolvedValue(makeUser());
    (prisma.users.update as ReturnType<typeof vi.fn>).mockResolvedValue(makeUser());

    const sha = (code: string) => createHash('sha256').update(code).digest('hex');
    // DB row is written BEFORE the SMS is sent — capture the hash and assert
    // against the code once both exist.
    let storedHash = '';
    (prisma.phoneVerifications.create as ReturnType<typeof vi.fn>).mockImplementation((args: { data: { codeHash: string } }) => {
      storedHash = args.data.codeHash;
      return {};
    });

    const result = await service.resendOtp('+998901112233', 'REGISTRATION');
    const rawCode = sent.at(-1)?.code;
    expect(rawCode).toMatch(/^\d{5}$/);
    expect(storedHash).not.toBe(rawCode);
    expect(storedHash).toHaveLength(64);
    expect(storedHash).toBe(sha(rawCode!));
    // Dev mode returns the code to the caller (test env only).
    expect(result.otpDev).toBe(rawCode);
  });
});
