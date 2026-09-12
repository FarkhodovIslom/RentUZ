import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { AuthUser } from '../decorators/current-user.decorator.js';
import type { Request } from 'express';

/**
 * §49/§54 admin gate — applied globally after RoleGuard. Only routes that
 * require the ADMIN role are checked: role AND status must both be ADMIN /
 * ACTIVE *in the JWT claim* (0_Phase.md §1 trap 14 — claims are minted at
 * login; tests must flip role/status in the DB before logging in). This
 * closes the hole SuspendedGuard leaves open on GET routes: a suspended
 * admin can read their profile but cannot touch any /admin surface.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || !required.includes('ADMIN')) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (request.user?.role !== 'ADMIN' || request.user.status !== 'ACTIVE') {
      throw new ForbiddenException({ code: 'INSUFFICIENT_PERMISSIONS' });
    }
    return true;
  }
}
