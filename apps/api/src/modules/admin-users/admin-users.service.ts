import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminUserDTOT,
  AdminUsersListQueryT,
  BulkSuspendResultT,
} from '@rentuz/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import { cursorMeta, parseCursor } from '../../common/utils/cursor.js';

/**
 * §58 admin user management. The suspend cascade (§54): user SUSPENDED/DELETED
 * → all refresh tokens revoked + ACTIVE properties PAUSED with
 * pausedReason='OWNER_SUSPENDED'. Activation restores ONLY those rows — an
 * owner-paused ('OWNER') or admin-paused ('ADMIN') listing stays paused.
 * This is the single implementation; reports.resolve(suspendTarget) reuses it.
 */
interface SetStatusInput {
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  reason?: string;
}

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: AdminUsersListQueryT,
  ): Promise<{ data: AdminUserDTOT[]; meta: ReturnType<typeof cursorMeta> }> {
    const { before } = parseCursor(query.cursor);
    const rows = await this.prisma.users.findMany({
      where: {
        ...(query.search
          ? {
              OR: [
                { phone: { contains: query.search } },
                { name: { contains: query.search, mode: 'insensitive' } },
                { email: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(query.role ? { role: query.role } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.createdFrom || query.createdTo
          ? {
              createdAt: {
                ...(query.createdFrom ? { gte: new Date(`${query.createdFrom}T00:00:00+05:00`) } : {}),
                ...(query.createdTo ? { lt: new Date(`${query.createdTo}T00:00:00+05:00`) } : {}),
              },
            }
          : {}),
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
    });

    const meta = cursorMeta(rows, query.limit);
    const page = rows.slice(0, query.limit);
    const withStats = await Promise.all(page.map((row) => this.attachStats(row)));
    return { data: withStats, meta };
  }

  async get(userId: string): Promise<AdminUserDTOT> {
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user || user.status === 'DELETED') throw new NotFoundException();
    return this.attachStats(user);
  }

  async setStatus(adminId: string, userId: string, input: SetStatusInput): Promise<AdminUserDTOT> {
    if (userId === adminId) {
      throw new ConflictException({ code: 'CONFLICT', message: 'O‘z holatingizni o‘zgartira olmaysiz' });
    }
    if ((input.status === 'SUSPENDED' || input.status === 'DELETED') && (!input.reason || input.reason.trim().length < 10)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'To‘xtatish/o‘chirish uchun izoh majburiy (kamida 10 belgi)',
      });
    }

    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user || user.status === 'DELETED') throw new NotFoundException();
    if (user.status === input.status) return this.attachStats(user); // idempotent no-op

    // Cascade (§54): suspend/delete pulls tokens + pauses ACTIVE listings.
    if (input.status === 'SUSPENDED' || input.status === 'DELETED') {
      await this.prisma.refreshTokens.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.prisma.properties.updateMany({
        where: { ownerId: userId, status: 'ACTIVE' },
        data: { status: 'PAUSED', pausedReason: 'OWNER_SUSPENDED' },
      });
    }

    // Activation restores ONLY suspension-paused listings (7_Phase.md §5).
    if (input.status === 'ACTIVE') {
      await this.prisma.properties.updateMany({
        where: { ownerId: userId, status: 'PAUSED', pausedReason: 'OWNER_SUSPENDED' },
        data: { status: 'ACTIVE', pausedReason: null },
      });
    }

    const updated = await this.prisma.users.update({
      where: { id: userId },
      data: { status: input.status },
    });
    return this.attachStats(updated);
  }

  /** Per-user atomic bulk suspend — one failure never blocks the others. */
  async bulkSuspend(adminId: string, userIds: string[], reason: string): Promise<BulkSuspendResultT> {
    const succeeded: Array<{ userId: string }> = [];
    const failed: Array<{ userId: string; reason: string }> = [];
    for (const userId of new Set(userIds)) {
      try {
        await this.setStatus(adminId, userId, { status: 'SUSPENDED', reason });
        succeeded.push({ userId });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failed.push({ userId, reason: message });
      }
    }
    return {
      succeeded,
      failed,
      counts: { succeeded: succeeded.length, failed: failed.length },
    };
  }

  // ── helpers ──

  private async attachStats(
    user: Awaited<ReturnType<PrismaService['users']['findUnique']>>,
  ): Promise<AdminUserDTOT> {
    const nonNull = user!;
    const [properties, activeProperties, requestsAsTenant, reportsAsUser, reportsViaProperties] =
      await Promise.all([
        this.prisma.properties.count({ where: { ownerId: nonNull.id, status: { not: 'DELETED' } } }),
        this.prisma.properties.count({ where: { ownerId: nonNull.id, status: 'ACTIVE' } }),
        this.prisma.rentalRequests.count({ where: { tenantId: nonNull.id } }),
        this.prisma.reports.count({ where: { targetType: 'USER', targetId: nonNull.id } }),
        this.prisma.$queryRaw<number>`
          SELECT count(*)::int FROM "reports" r
          JOIN "properties" p ON p.id = r."targetId"
          WHERE r."targetType" = 'PROPERTY' AND p."ownerId" = ${nonNull.id}::uuid`,
      ]);
    return {
      id: nonNull.id,
      name: nonNull.name,
      phone: nonNull.phone,
      email: nonNull.email,
      avatar: nonNull.avatar,
      role: nonNull.role,
      status: nonNull.status,
      isPhoneVerified: nonNull.isPhoneVerified,
      canListProperties: nonNull.canListProperties,
      createdAt: nonNull.createdAt,
      stats: {
        properties,
        activeProperties,
        requestsAsTenant,
        reportsAgainst: reportsAsUser + Number(reportsViaProperties),
      },
    };
  }
}
