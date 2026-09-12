import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TokenService } from '../../common/services/token.service.js';
import { RedisService } from '../../redis/redis.service.js';

/** Redis key prefix for unconsumed tickets (`ticket:{jti}`, TTL 60 s). */
const TICKET_KEY = (jti: string) => `ticket:${jti}`;

/**
 * §28 WebSocket auth — 60 s single-use JWT socket tickets. The web BFF mints
 * one per connection attempt via POST /realtime/ticket; the gateway consumes
 * it during the handshake (verify + GETDEL — a second use finds nothing).
 */
@Injectable()
export class SocketTicketService {
  constructor(
    private readonly tokens: TokenService,
    private readonly redisService: RedisService,
  ) {}

  async issue(userId: string): Promise<{ ticket: string; expiresIn: number }> {
    const jti = randomUUID();
    // SET ... EX — the Redis TTL is the single-use ledger; even an unverified
    // JWT cannot be replayed once GETDEL removes the jti.
    await this.redisService.client.set(TICKET_KEY(jti), userId, 'EX', 60);
    const ticket = this.tokens.signSocketTicket({ sub: userId, jti });
    return { ticket, expiresIn: 60 };
  }

  /** Returns the userId, or throws 401 INVALID_TICKET (also on reuse). */
  async consume(ticket: string): Promise<string> {
    let payload: { sub: string; jti?: string };
    try {
      payload = this.tokens.verifySocketTicket(ticket);
    } catch {
      throw new UnauthorizedException({ code: 'INVALID_TICKET' });
    }
    if (!payload.jti) {
      throw new UnauthorizedException({ code: 'INVALID_TICKET' });
    }
    const userId = await this.redisService.client.getdel(TICKET_KEY(payload.jti));
    if (!userId) {
      throw new UnauthorizedException({ code: 'INVALID_TICKET' });
    }
    return userId;
  }
}
