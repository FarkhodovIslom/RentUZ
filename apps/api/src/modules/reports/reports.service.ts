import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  deriveReportPriority,
  type ReportCreateInputT,
  type ReportDTOT,
  type ReportListQueryT,
  type ReportResolveBodyT,
} from '@rentuz/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SearchCacheService } from '../search/search-cache.service.js';
import { AdminUsersService } from '../admin-users/admin-users.service.js';
import { cursorMeta, parseCursor } from '../../common/utils/cursor.js';
import type { reports } from '../../generated/prisma/client.js';

/**
 * §47/§61 reports. Public create (throttled 10/h per user at the controller);
 * admin list/resolve. Priority is auto-derived on create; CRITICAL is only
 * reachable via admin escalation. Resolving may suspend the target user or
 * remove the reported listing (cascade handled by AdminUsersService — the
 * single implementation of the §58 suspend matrix).
 */
type ReportWithReporter = reports & {
  reporter: { id: string; name: string; phone: string };
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminUsers: AdminUsersService,
    private readonly searchCache: SearchCacheService,
  ) {}

  async create(reporterId: string, input: ReportCreateInputT): Promise<{ id: string; priority: string; status: string }> {
    const ownerId = await this.resolveTargetOwnerId(input.targetType, input.targetId);
    if (ownerId === null) throw new NotFoundException();
    if (ownerId === reporterId) {
      throw new BadRequestException({ code: 'CANNOT_REPORT_SELF', message: 'O‘z ma\'lumotingizga shikoyat yuborilmaydi' });
    }

    const duplicate = await this.prisma.reports.findFirst({
      where: {
        reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        status: { in: ['OPEN', 'REVIEWING'] },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({ code: 'REPORT_ALREADY_OPEN', message: 'Bu maqsad bo‘yicha ochiq shikoyatingiz bor' });
    }

    const created = await this.prisma.reports.create({
      data: {
        reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        description: input.description,
        evidence: input.evidence ?? [],
        priority: deriveReportPriority(input.reason),
      },
      select: { id: true, priority: true, status: true },
    });
    return created;
  }

  async listForAdmin(
    query: ReportListQueryT,
  ): Promise<{ data: ReportDTOT[]; meta: ReturnType<typeof cursorMeta> }> {
    const { before } = parseCursor(query.cursor);
    const rows = await this.prisma.reports.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.priority ? { priority: query.priority } : {}),
        ...(query.targetType ? { targetType: query.targetType } : {}),
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
      include: { reporter: { select: { id: true, name: true, phone: true } } },
    });

    const meta = cursorMeta(rows, query.limit);
    const page = rows.slice(0, query.limit);
    const hydrated = await Promise.all(page.map((row) => this.hydrateTarget(row)));
    return { data: hydrated, meta };
  }

  async getForAdmin(reportId: string): Promise<ReportDTOT> {
    const row = await this.prisma.reports.findUnique({
      where: { id: reportId },
      include: { reporter: { select: { id: true, name: true, phone: true } } },
    });
    if (!row) throw new NotFoundException();
    return this.hydrateTarget(row);
  }

  /**
   * PATCH /admin/reports/:id — RESOLVED/REJECTED close the report (note
   * mandatory on REJECTED, enforced by the ReportResolveBody contract);
   * ESCALATED flips priority to CRITICAL and keeps it open. suspendTarget /
   * removeListing apply on RESOLVED only.
   */
  async resolve(adminId: string, reportId: string, body: ReportResolveBodyT) {
    const report = await this.prisma.reports.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException();
    if (report.status === 'RESOLVED' || report.status === 'REJECTED') {
      throw new ConflictException({ code: 'CONFLICT', message: 'Shikoyat allaqachon yopilgan' });
    }

    if (body.action === 'ESCALATED') {
      const updated = await this.prisma.reports.update({
        where: { id: reportId },
        data: { priority: 'CRITICAL' },
        select: { id: true, priority: true, status: true },
      });
      return { ...updated, action: 'ESCALATED' as const };
    }

    if (body.suspendTarget) {
      const targetUserId = await this.resolveTargetOwnerId(report.targetType, report.targetId);
      if (targetUserId === null) throw new NotFoundException();
      await this.adminUsers.setStatus(adminId, targetUserId, {
        status: 'SUSPENDED',
        reason: body.note ?? `Shikoyat yopildi (${report.id})`,
      });
    }

    if (body.removeListing) {
      if (report.targetType !== 'PROPERTY') {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'removeListing faqat PROPERTY shikoyatlarida qo‘llanadi',
        });
      }
      await this.prisma.properties.update({
        where: { id: report.targetId },
        data: { status: 'DELETED' },
      });
      await this.searchCache.bumpVersion();
    }

    const updated = await this.prisma.reports.update({
      where: { id: reportId },
      data: {
        status: body.action,
        resolutionNote: body.note,
        resolvedBy: adminId,
        resolvedAt: new Date(),
      },
      select: { id: true, priority: true, status: true },
    });
    return { ...updated, action: body.action };
  }

  // ── helpers ──

  /**
   * The "owner" behind a target: USER → the user, PROPERTY → the listing's
   * owner, MESSAGE → the sender. Also validates existence (null → 404).
   */
  private async resolveTargetOwnerId(
    targetType: ReportCreateInputT['targetType'],
    targetId: string,
  ): Promise<string | null> {
    if (targetType === 'USER') {
      const user = await this.prisma.users.findUnique({ where: { id: targetId }, select: { id: true } });
      return user?.id ?? null;
    }
    if (targetType === 'PROPERTY') {
      const prop = await this.prisma.properties.findUnique({
        where: { id: targetId },
        select: { ownerId: true, status: true },
      });
      if (!prop || prop.status === 'DELETED') return null;
      return prop.ownerId;
    }
    const message = await this.prisma.messages.findUnique({
      where: { id: targetId },
      select: { senderId: true },
    });
    return message?.senderId ?? null;
  }

  private async hydrateTarget(row: ReportWithReporter): Promise<ReportDTOT> {
    let target: ReportDTOT['target'] = null;
    if (row.targetType === 'USER') {
      const user = await this.prisma.users.findUnique({
        where: { id: row.targetId },
        select: { id: true, name: true, phone: true },
      });
      if (user) target = { kind: 'USER', id: user.id, label: `${user.name} (${user.phone})`, ownerId: user.id };
    } else if (row.targetType === 'PROPERTY') {
      const prop = await this.prisma.properties.findUnique({
        where: { id: row.targetId },
        select: { id: true, title: true, ownerId: true, status: true },
      });
      if (prop) {
        target = { kind: 'PROPERTY', id: prop.id, label: prop.title, ownerId: prop.ownerId };
      }
    } else {
      const message = await this.prisma.messages.findUnique({
        where: { id: row.targetId },
        select: { id: true, text: true, senderId: true },
      });
      if (message) {
        target = {
          kind: 'MESSAGE',
          id: message.id,
          label: message.text.slice(0, 80),
          ownerId: message.senderId,
        };
      }
    }
    return {
      id: row.id,
      reporter: row.reporter,
      targetType: row.targetType,
      targetId: row.targetId,
      target,
      reason: row.reason as ReportDTOT['reason'],
      description: row.description,
      evidence: (row.evidence as ReportDTOT['evidence']) ?? [],
      priority: row.priority,
      status: row.status,
      resolutionNote: row.resolutionNote,
      resolvedBy: row.resolvedBy,
      resolvedAt: row.resolvedAt,
      createdAt: row.createdAt,
    };
  }
}
