import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ReportsService } from './reports.service.js';

const reporter = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const owner = '1b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6e';
const property = '2b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6f';
const report = '3b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb70';

function makeService() {
  const prisma = {
    reports: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    users: { findUnique: vi.fn() },
    properties: { findUnique: vi.fn(), update: vi.fn() },
    messages: { findUnique: vi.fn() },
    $queryRaw: vi.fn(),
  };
  const adminUsers = { setStatus: vi.fn() };
  const searchCache = { bumpVersion: vi.fn() };
  const svc = new ReportsService(prisma as never, adminUsers as never, searchCache as never);
  return { svc, prisma, adminUsers, searchCache };
}

describe('ReportsService.create', () => {
  it('auto-derives HIGH priority for SCAM', async () => {
    const { svc, prisma } = makeService();
    prisma.properties.findUnique.mockResolvedValue({ ownerId: owner, status: 'ACTIVE' });
    prisma.reports.findFirst.mockResolvedValue(null);
    prisma.reports.create.mockImplementation(({ data }: { data: { priority: string } }) => ({
      id: report,
      priority: data.priority,
      status: 'OPEN',
    }));

    const result = await svc.create(reporter, { targetType: 'PROPERTY', targetId: property, reason: 'SCAM' });
    expect(result.priority).toBe('HIGH');
    expect(prisma.reports.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ priority: 'HIGH', targetId: property }) }),
    );
  });

  it('auto-derives MEDIUM for WRONG_PRICE', async () => {
    const { svc, prisma } = makeService();
    prisma.properties.findUnique.mockResolvedValue({ ownerId: owner, status: 'ACTIVE' });
    prisma.reports.findFirst.mockResolvedValue(null);
    prisma.reports.create.mockImplementation(({ data }: { data: { priority: string } }) => ({ id: report, ...data }));

    const result = await svc.create(reporter, { targetType: 'PROPERTY', targetId: property, reason: 'WRONG_PRICE' });
    expect(result.priority).toBe('MEDIUM');
  });

  it('rejects self-reports with CANNOT_REPORT_SELF', async () => {
    const { svc, prisma } = makeService();
    prisma.properties.findUnique.mockResolvedValue({ ownerId: reporter, status: 'ACTIVE' });
    await expect(
      svc.create(reporter, { targetType: 'PROPERTY', targetId: property, reason: 'SCAM' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a duplicate open report with REPORT_ALREADY_OPEN', async () => {
    const { svc, prisma } = makeService();
    prisma.properties.findUnique.mockResolvedValue({ ownerId: owner, status: 'ACTIVE' });
    prisma.reports.findFirst.mockResolvedValue({ id: report });
    await expect(
      svc.create(reporter, { targetType: 'PROPERTY', targetId: property, reason: 'SCAM' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('404s when the target does not exist', async () => {
    const { svc, prisma } = makeService();
    prisma.users.findUnique.mockResolvedValue(null);
    await expect(
      svc.create(reporter, { targetType: 'USER', targetId: owner, reason: 'OTHER' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ReportsService.resolve', () => {
  it('suspends the target owner on resolve(suspendTarget)', async () => {
    const { svc, prisma, adminUsers } = makeService();
    prisma.reports.findUnique.mockResolvedValue({ id: report, targetType: 'PROPERTY', targetId: property, status: 'OPEN' });
    prisma.properties.findUnique.mockResolvedValue({ ownerId: owner, status: 'ACTIVE' });
    prisma.reports.update.mockResolvedValue({ id: report, priority: 'HIGH', status: 'RESOLVED' });

    const result = await svc.resolve(owner, report, { action: 'RESOLVED', suspendTarget: true, note: 'tasdiqlandi va to‘xtatildi' });
    expect(adminUsers.setStatus).toHaveBeenCalledWith(
      owner,
      owner,
      expect.objectContaining({ status: 'SUSPENDED' }),
    );
    expect(result.status).toBe('RESOLVED');
  });

  it('removes the listing on resolve(removeListing)', async () => {
    const { svc, prisma, searchCache } = makeService();
    prisma.reports.findUnique.mockResolvedValue({ id: report, targetType: 'PROPERTY', targetId: property, status: 'OPEN' });
    prisma.properties.update.mockResolvedValue({});
    prisma.reports.update.mockResolvedValue({ id: report, priority: 'HIGH', status: 'RESOLVED' });

    await svc.resolve(owner, report, { action: 'RESOLVED', removeListing: true });
    expect(prisma.properties.update).toHaveBeenCalledWith({
      where: { id: property },
      data: { status: 'DELETED' },
    });
    expect(searchCache.bumpVersion).toHaveBeenCalled();
  });

  it('rejects removeListing on a non-property target', async () => {
    const { svc, prisma } = makeService();
    prisma.reports.findUnique.mockResolvedValue({ id: report, targetType: 'USER', targetId: owner, status: 'OPEN' });
    await expect(svc.resolve(owner, report, { action: 'RESOLVED', removeListing: true })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('escalates to CRITICAL without closing the report', async () => {
    const { svc, prisma } = makeService();
    prisma.reports.findUnique.mockResolvedValue({ id: report, targetType: 'USER', targetId: owner, status: 'OPEN' });
    prisma.reports.update.mockResolvedValue({ id: report, priority: 'CRITICAL', status: 'OPEN' });

    const result = await svc.resolve(owner, report, { action: 'ESCALATED' });
    expect(prisma.reports.update).toHaveBeenCalledWith({
      where: { id: report },
      data: { priority: 'CRITICAL' },
      select: { id: true, priority: true, status: true },
    });
    expect(result.action).toBe('ESCALATED');
  });

  it('conflicts when the report is already closed', async () => {
    const { svc, prisma } = makeService();
    prisma.reports.findUnique.mockResolvedValue({ id: report, status: 'RESOLVED' });
    await expect(svc.resolve(owner, report, { action: 'ESCALATED' })).rejects.toBeInstanceOf(ConflictException);
  });
});
