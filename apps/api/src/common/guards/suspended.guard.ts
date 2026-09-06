import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../decorators/current-user.decorator.js';

/**
 * Suspended users may read their own profile but are blocked from every
 * mutating endpoint (§54 "Suspended User").
 */
@Injectable()
export class SuspendedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const method = request.method;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
    if (request.user?.status === 'SUSPENDED') {
      throw new ForbiddenException({ code: 'INSUFFICIENT_PERMISSIONS' });
    }
    return true;
  }
}
