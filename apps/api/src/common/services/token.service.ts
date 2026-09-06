import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface AccessTokenPayload {
  sub: string;
  role: string;
  status: string;
}

/**
 * Access tokens (aud "api", JWT_ACCESS_SECRET, short TTL) and socket tickets
 * (aud "socket", SOCKET_TICKET_SECRET — used from Phase 5). Separate audiences
 * prevent a socket ticket being replayed as an API token.
 */
@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  signAccessToken(payload: AccessTokenPayload): string {
    return this.jwt.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: process.env.JWT_ACCESS_TTL ?? '15m',
      audience: 'api',
    } as Parameters<typeof this.jwt.sign>[1]);
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwt.verify<AccessTokenPayload>(token, {
      secret: process.env.JWT_ACCESS_SECRET,
      audience: 'api',
    });
  }

  signSocketTicket(payload: { sub: string }): string {
    return this.jwt.sign(payload, {
      secret: process.env.SOCKET_TICKET_SECRET,
      expiresIn: '60s',
      audience: 'socket',
    });
  }

  verifySocketTicket(token: string): { sub: string } {
    return this.jwt.verify<{ sub: string }>(token, {
      secret: process.env.SOCKET_TICKET_SECRET,
      audience: 'socket',
    });
  }
}
