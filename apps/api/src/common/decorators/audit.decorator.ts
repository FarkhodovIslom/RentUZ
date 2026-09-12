import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit:action';

export interface AuditMetadata {
  /** Static action name, or a resolver over the (validated) request body —
   *  e.g. PATCH /admin/reports/:id maps RESOLVED|REJECTED|ESCALATED to
   *  REPORT_RESOLVED / REPORT_REJECTED / REPORT_ESCALATED. */
  action: string | ((body: unknown) => string);
  targetType: string;
}

/**
 * §73 — marks a route for the AuditLogInterceptor. On success (2xx) the
 * interceptor inserts an auditLogs row: adminId = JWT subject (never body),
 * targetId = response data.id ?? req.params.id ?? adminId, metadata =
 * sanitized request body.
 */
export const Audit = (action: string | ((body: unknown) => string), targetType: string): MethodDecorator & ClassDecorator =>
  SetMetadata(AUDIT_KEY, { action, targetType });
