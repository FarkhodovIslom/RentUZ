import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { AuthUser } from '../decorators/current-user.decorator.js';
import { TokenService } from '../services/token.service.js';

/** Validates the access token from `Authorization: Bearer` or the `rentuz_at` cookie. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = request.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const token = bearer ?? (request.cookies?.['rentuz_at'] as string | undefined);

    if (isPublic) {
      // Best-effort identity on public routes (view tracking, §1.3): a valid
      // token enriches the request; absent or expired stays anonymous.
      if (token) {
        try {
          const payload = this.tokens.verifyAccessToken(token);
          request.user = { id: payload.sub, role: payload.role, status: payload.status };
        } catch {
          // Anonymous.
        }
      }
      return true;
    }

    if (!token) throw new UnauthorizedException();
    let payload: { sub: string; role: string; status: string };
    try {
      payload = this.tokens.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException();
    }
    request.user = { id: payload.sub, role: payload.role, status: payload.status };
    return true;
  }
}
