import { Injectable, Logger, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { mergeMap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuthUser } from '../decorators/current-user.decorator.js';
import { AUDIT_KEY, type AuditMetadata } from '../decorators/audit.decorator.js';

/** Keys never written into audit metadata (§74 secrets hygiene). */
const SENSITIVE_KEYS = /^(password|otp|code|token|secret|authorization)$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.test(key)) continue;
      out[key] = sanitize(nested);
    }
    return out;
  }
  if (typeof value === 'bigint') return value.toString();
  return value;
}

/**
 * §73 audit trail. Registered globally but only acts on routes carrying
 * `@Audit(action, targetType)` metadata. The insert is awaited inside the
 * response stream (mergeMap) so the audit row deterministically exists once
 * the HTTP response arrives — and it can never fail the request itself.
 *
 * adminId always comes from the JWT subject (impersonation test target);
 * targetId prefers the response `data.id`, falls back to `req.params.id`,
 * then to the acting admin (auditLogs.targetId is NOT NULL uuid — SETTINGS
 * and bulk rows self-target).
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.get<AuditMetadata>(AUDIT_KEY, context.getHandler());
    if (!metadata) return next.handle();

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const adminId = request.user?.id;
    if (!adminId) return next.handle();

    return next.handle().pipe(
      mergeMap(async (response) => {
        await this.writeRow(metadata, adminId, request, response);
        return response;
      }),
    );
  }

  private async writeRow(
    metadata: AuditMetadata,
    adminId: string,
    request: Request,
    response: unknown,
  ): Promise<void> {
    try {
      const action = typeof metadata.action === 'function' ? metadata.action(request.body) : metadata.action;
      const fromResponse =
        response && typeof response === 'object' && 'data' in response
          ? (response as { data?: { id?: unknown } }).data?.id
          : undefined;
      const fromParams = request.params ? (request.params as Record<string, string>).id : undefined;
      const responseId = typeof fromResponse === 'string' && UUID_RE.test(fromResponse) ? fromResponse : undefined;
      const paramId = fromParams && UUID_RE.test(fromParams) ? fromParams : undefined;
      const targetId = responseId ?? paramId ?? adminId;

      await this.prisma.auditLogs.create({
        data: {
          adminId,
          action,
          targetType: metadata.targetType,
          targetId,
          metadata: sanitize(request.body ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      // A completed admin action is never failed by its own audit write —
      // the error is loud in logs instead.
      this.logger.error(
        `audit write failed (${String(metadata.action)}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
