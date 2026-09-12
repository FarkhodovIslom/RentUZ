import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service.js';

const admin = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const userId = '1b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6e';

function userRow(status: 'ACTIVE' | 'SUSPENDED' | 'DELETED' = 'ACTIVE') {
  return {
    id: userId,
    name: 'Test User',
    phone: '+998901112233',
    email: null,
    avatar: null,
    role: 'USER' as const,
    status,
    isPhoneVerified: true,
    canListProperties: true,
    createdAt: new Date(),
  };
}

function makeService() {
  const prisma = {
    users: { findUnique: vi.fn(), update: vi.fn() },
    refreshTokens: { updateMany: vi.fn() },
    properties: { updateMany: vi.fn(), count: vi.fn() },
    rentalRequests: { count: vi.fn() },
    reports: { count: vi.fn() },
    $queryRaw: vi.fn(),
  };
  // stats defaults
  prisma.properties.count.mockResolvedValue(0);
  prisma.rentalRequests.count.mockResolvedValue(0);
  prisma.reports.count.mockResolvedValue(0);
  prisma.$queryRaw.mockResolvedValue(0);
  prisma.users.update.mockImplementation(({ data }: { data: { status: string } }) => ({
    ...userRow(),
    status: data.status,
  }));
  const svc = new AdminUsersService(prisma as never);
  return { svc, prisma };
}

describe('AdminUsersService.setStatus — suspend/activate cascade', () => {
  it('suspends: revokes tokens and pauses ACTIVE listings with OWNER_SUSPENDED', async () => {
    const { svc, prisma } = makeService();
    prisma.users.findUnique.mockResolvedValue(userRow('ACTIVE'));

    await svc.setStatus(admin, userId, { status: 'SUSPENDED', reason: 'qoidabuzarlik uchun sabab' });

    expect(prisma.refreshTokens.updateMany).toHaveBeenCalledWith({
      where: { userId, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.properties.updateMany).toHaveBeenCalledWith({
      where: { ownerId: userId, status: 'ACTIVE' },
      data: { status: 'PAUSED', pausedReason: 'OWNER_SUSPENDED' },
    });
    expect(prisma.users.update).toHaveBeenCalledWith({ where: { id: userId }, data: { status: 'SUSPENDED' } });
  });

  it('activates: restores ONLY OWNER_SUSPENDED-paused listings', async () => {
    const { svc, prisma } = makeService();
    prisma.users.findUnique.mockResolvedValue(userRow('SUSPENDED'));

    await svc.setStatus(admin, userId, { status: 'ACTIVE' });

    expect(prisma.properties.updateMany).toHaveBeenCalledWith({
      where: { ownerId: userId, status: 'PAUSED', pausedReason: 'OWNER_SUSPENDED' },
      data: { status: 'ACTIVE', pausedReason: null },
    });
    // Activation must NOT revoke tokens or pause anything.
    expect(prisma.refreshTokens.updateMany).not.toHaveBeenCalled();
    expect(prisma.properties.updateMany).toHaveBeenCalledTimes(1);
  });

  it('rejects a reason shorter than 10 chars for SUSPENDED/DELETED', async () => {
    const { svc, prisma } = makeService();
    prisma.users.findUnique.mockResolvedValue(userRow('ACTIVE'));
    await expect(svc.setStatus(admin, userId, { status: 'SUSPENDED', reason: 'qisqa' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.setStatus(admin, userId, { status: 'DELETED', reason: 'qisqa' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses self-modification', async () => {
    const { svc } = makeService();
    await expect(svc.setStatus(admin, admin, { status: 'SUSPENDED', reason: 'yetarlicha uzun' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('treats a same-status call as an idempotent no-op', async () => {
    const { svc, prisma } = makeService();
    prisma.users.findUnique.mockResolvedValue(userRow('SUSPENDED'));
    await svc.setStatus(admin, userId, { status: 'SUSPENDED', reason: 'yetarlicha uzun' });
    expect(prisma.refreshTokens.updateMany).not.toHaveBeenCalled();
    expect(prisma.users.update).not.toHaveBeenCalled();
  });

  it('404s for a DELETED user', async () => {
    const { svc, prisma } = makeService();
    prisma.users.findUnique.mockResolvedValue(null);
    await expect(svc.setStatus(admin, userId, { status: 'ACTIVE' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AdminUsersService.bulkSuspend — per-user report', () => {
  it('counts successes and failures independently', async () => {
    const { svc, prisma } = makeService();
    const ids = Array.from({ length: 10 }, (_, i) => `1b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb${(60 + i).toString(16)}`);
    // One already deleted → not found.
    prisma.users.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      where.id === ids[0] ? Promise.resolve(null) : Promise.resolve(userRow('ACTIVE')),
    );

    const result = await svc.bulkSuspend(admin, ids, 'ommaviy sabab yetarli');
    expect(result.counts.succeeded).toBe(9);
    expect(result.counts.failed).toBe(1);
    expect(result.failed[0]?.userId).toBe(ids[0]);
  });
});
