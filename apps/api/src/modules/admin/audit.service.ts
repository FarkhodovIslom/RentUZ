import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { cursorMeta, parseCursor } from '../../common/utils/cursor.js';
import type { AuditListQueryT, AuditLogDTOT } from '@rentuz/contracts';
/**
 * §73 audit trail service. The AuditLogInterceptor covers HTTP routes;
 * `log()` is the entry point for non-HTTP writers (jobs, future schedulers).
 * Audit rows are never auto-deleted (compliance — 7_Phase.md §5).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: {
    adminId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.auditLogs.create({
        data: {
          adminId: entry.adminId,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId,
          metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.logger.error(
        `audit log failed (${entry.action}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Reverse-chrono cursor list for the /admin/settings audit tab. */
  async list(query: AuditListQueryT): Promise<{ data: AuditLogDTOT[]; meta: ReturnType<typeof cursorMeta> }> {
    const where: Prisma.auditLogsWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.adminId ? { adminId: query.adminId } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
    };

    const { before } = parseCursor(query.cursor);
    const rows = await this.prisma.auditLogs.findMany({
      where: {
        ...where,
        // (createdAt DESC, id DESC) keyset — mirrors the notifications list.
        ...(before
          ? {
              OR: [
                { createdAt: { lt: before.createdAt } },
                { createdAt: before.createdAt, id: { lt: before.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: { admin: { select: { id: true, name: true, phone: true } } },
    });

    const meta = cursorMeta(rows, query.limit);
    const page = rows.slice(0, query.limit);
    return {
      data: page.map((row) => ({
        id: row.id,
        admin: row.admin,
        adminId: row.adminId,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
        createdAt: row.createdAt,
      })),
      meta,
    };
  }
}
