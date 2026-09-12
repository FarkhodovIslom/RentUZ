import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { SocketTicketService } from './socket-ticket.service.js';

/** Hand-rolled stubs per auth.service.test precedent (no Nest DI). */
function makeService(redisStub: { set: ReturnType<typeof vi.fn>; getdel: ReturnType<typeof vi.fn> }) {
  const tokens = {
    signSocketTicket: vi.fn((payload: { sub: string; jti?: string }) => `ticket:${payload.jti}`),
    verifySocketTicket: vi.fn((token: string) => {
      if (token === 'bad-token') throw new Error('jwt expired');
      const jti = token.replace('ticket:', '');
      if (jti === 'no-jti') return { sub: 'u1' };
      return { sub: 'u1', jti };
    }),
  };
  const redis = { client: redisStub };
  const service = new SocketTicketService(tokens as never, redis as never);
  return { service, tokens };
}

describe('SocketTicketService', () => {
  it('issue stores the jti ledger with a 60 s TTL and signs { sub, jti }', async () => {
    const set = vi.fn().mockResolvedValue('OK');
    const { service, tokens } = makeService({ set, getdel: vi.fn() });
    const result = await service.issue('user-1');
    expect(result.expiresIn).toBe(60);
    expect(result.ticket).toMatch(/^ticket:[0-9a-f-]{36}$/);
    expect(set).toHaveBeenCalledWith(expect.stringMatching(/^ticket:[0-9a-f-]{36}$/), 'user-1', 'EX', 60);
    expect(tokens.signSocketTicket).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'user-1', jti: expect.any(String) }),
    );
  });

  it('consume returns the userId for a fresh ticket', async () => {
    const { service } = makeService({
      set: vi.fn(),
      getdel: vi.fn().mockResolvedValue('user-1'),
    });
    await expect(service.consume('ticket:abc')).resolves.toBe('user-1');
  });

  it('a reused ticket (GETDEL → nil) throws 401 INVALID_TICKET — single-use', async () => {
    const { service } = makeService({
      set: vi.fn(),
      getdel: vi.fn().mockResolvedValue(null),
    });
    await expect(service.consume('ticket:abc')).rejects.toMatchObject({
      status: 401,
      // UnauthorizedException carries the code in getResponse()
    });
    try {
      await service.consume('ticket:abc');
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toMatchObject({ code: 'INVALID_TICKET' });
    }
  });

  it('an invalid JWT or a ticket without jti throws INVALID_TICKET', async () => {
    const { service } = makeService({
      set: vi.fn(),
      getdel: vi.fn().mockResolvedValue('user-1'),
    });
    await expect(service.consume('bad-token')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.consume('ticket:no-jti')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
