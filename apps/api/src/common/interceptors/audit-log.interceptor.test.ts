import { describe, expect, it, vi } from 'vitest';
import { firstValueFrom, of } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditLogInterceptor } from './audit-log.interceptor.js';
import { AUDIT_KEY } from '../decorators/audit.decorator.js';

const admin = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const property = '1b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6e';

function makeContext(overrides?: { body?: unknown; params?: Record<string, string> }) {
  const request = {
    user: { id: admin, role: 'ADMIN', status: 'ACTIVE' },
    body: overrides?.body ?? { reason: 'sabab yetarlicha uzun', password: 'secret' },
    params: overrides?.params ?? {},
  };
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

function makeInterceptor(audit: unknown) {
  const prisma = { auditLogs: { create: vi.fn().mockResolvedValue({}) } };
  const reflector = { get: vi.fn(() => audit) } as unknown as Reflector;
  const interceptor = new AuditLogInterceptor(prisma as never, reflector);
  return { interceptor, prisma };
}

describe('AuditLogInterceptor', () => {
  it('writes a row on a decorated route using the JWT subject and response id', async () => {
    const { interceptor, prisma } = makeInterceptor({ action: 'PROPERTY_APPROVED', targetType: 'PROPERTY' });
    const { context } = makeContext();
    const next: CallHandler = { handle: () => of({ success: true, data: { id: property } }) };

    await firstValueFrom(interceptor.intercept(context, next));

    expect(prisma.auditLogs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminId: admin,
        action: 'PROPERTY_APPROVED',
        targetType: 'PROPERTY',
        targetId: property,
      }),
    });
  });

  it('sanitizes secrets out of the metadata', async () => {
    const { interceptor, prisma } = makeInterceptor({ action: 'FLAGS_UPDATED', targetType: 'SETTINGS' });
    const { context } = makeContext();
    const next: CallHandler = { handle: () => of({ success: true, data: {} }) };

    await firstValueFrom(interceptor.intercept(context, next));

    const metadata = (prisma.auditLogs.create.mock.calls[0]?.[0] as { data: { metadata: Record<string, unknown> } })
      .data.metadata;
    expect(metadata.reason).toBe('sabab yetarlicha uzun');
    expect(metadata.password).toBeUndefined();
  });

  it('falls back to params.id then to the acting admin for targetId', async () => {
    const { interceptor, prisma } = makeInterceptor({ action: 'REPORT_RESOLVED', targetType: 'REPORT' });
    const { context } = makeContext({ params: { id: property } });
    const next: CallHandler = { handle: () => of({ success: true, data: { id: 'not-a-uuid' } }) };

    await firstValueFrom(interceptor.intercept(context, next));
    expect(prisma.auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ targetId: property }) }),
    );
  });

  it('does nothing on routes without @Audit metadata', async () => {
    const { interceptor, prisma } = makeInterceptor(undefined);
    const { context } = makeContext();
    const next: CallHandler = { handle: () => of({ success: true, data: { id: property } }) };

    await firstValueFrom(interceptor.intercept(context, next));
    expect(prisma.auditLogs.create).not.toHaveBeenCalled();
  });

  it('resolves a function action from the request body', async () => {
    const { interceptor, prisma } = makeInterceptor({
      action: (body: unknown) => `REPORT_${(body as { action?: string }).action}`,
      targetType: 'REPORT',
    });
    const { context } = makeContext({ body: { action: 'ESCALATED' } });
    const next: CallHandler = { handle: () => of({ success: true, data: { id: property } }) };

    await firstValueFrom(interceptor.intercept(context, next));
    expect(prisma.auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'REPORT_ESCALATED' }) }),
    );
  });
});

describe('AUDIT_KEY', () => {
  it('is a stable metadata key', () => {
    expect(AUDIT_KEY).toBe('audit:action');
  });
});
