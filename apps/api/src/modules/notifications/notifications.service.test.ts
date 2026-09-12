import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';

function makeMocks() {
  const prisma = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    notifications: {
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const redis = {
    client: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { prisma: prisma as any, redis: redis as any };
}

const user = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const other = '1b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6e';

describe('NotificationsService.enqueue', () => {
  it('reports inserted=true and busts the unread cache on a fresh row', async () => {
    const { prisma, redis } = makeMocks();
    prisma.$executeRaw.mockResolvedValue(1);
    const svc = new NotificationsService(prisma, redis);
    const ok = await svc.enqueue({
      userId: user,
      type: 'REQUEST_NEW',
      titleKey: 'notifications.types.requestNew',
      bodyKey: 'request.new',
      data: { key: 'request:42:new' },
    });
    expect(ok).toBe(true);
    expect(redis.client.del).toHaveBeenCalledWith(`notif:unread:${user}`);
  });

  it('ON CONFLICT replay (0 rows) is a no-op and keeps the cache', async () => {
    const { prisma, redis } = makeMocks();
    prisma.$executeRaw.mockResolvedValue(0);
    const svc = new NotificationsService(prisma, redis);
    const ok = await svc.enqueue({
      userId: user,
      type: 'REQUEST_NEW',
      titleKey: 'notifications.types.requestNew',
      bodyKey: 'request.new',
      data: { key: 'request:42:new' },
    });
    expect(ok).toBe(false);
    expect(redis.client.del).not.toHaveBeenCalled();
  });

  it('DB failures never throw out of the fire-and-forget path', async () => {
    const { prisma, redis } = makeMocks();
    prisma.$executeRaw.mockRejectedValue(new Error('connection reset'));
    const svc = new NotificationsService(prisma, redis);
    await expect(
      svc.enqueue({ userId: user, type: 'NEW_MESSAGE', titleKey: 't', bodyKey: 'b', data: { key: 'x' } }),
    ).resolves.toBe(false);
  });
});

describe('NotificationsService.unreadCount', () => {
  it('serves a cached value without touching the DB', async () => {
    const { prisma, redis } = makeMocks();
    redis.client.get.mockResolvedValue('7');
    const svc = new NotificationsService(prisma, redis);
    await expect(svc.unreadCount(user)).resolves.toBe(7);
    expect(prisma.notifications.count).not.toHaveBeenCalled();
  });

  it('miss → COUNT + 30 s SET', async () => {
    const { prisma, redis } = makeMocks();
    redis.client.get.mockResolvedValue(null);
    prisma.notifications.count.mockResolvedValue(3);
    const svc = new NotificationsService(prisma, redis);
    await expect(svc.unreadCount(user)).resolves.toBe(3);
    expect(prisma.notifications.count).toHaveBeenCalledWith({ where: { userId: user, readAt: null } });
    expect(redis.client.set).toHaveBeenCalledWith(`notif:unread:${user}`, '3', 'EX', 30);
  });
});

describe('NotificationsService.markRead / markAllRead', () => {
  it('404s for unknown ids and 403s for foreign rows', async () => {
    const { prisma, redis } = makeMocks();
    const svc = new NotificationsService(prisma, redis);
    prisma.notifications.findUnique.mockResolvedValue(null);
    await expect(svc.markRead(user, other)).rejects.toBeInstanceOf(NotFoundException);
    prisma.notifications.findUnique.mockResolvedValue({ userId: other, readAt: null });
    await expect(svc.markRead(user, other)).rejects.toBeInstanceOf(ForbiddenException);
    expect(redis.client.del).not.toHaveBeenCalled();
  });

  it('marks own unread row and invalidates the cache', async () => {
    const { prisma, redis } = makeMocks();
    const readAt = new Date();
    prisma.notifications.findUnique.mockResolvedValue({ userId: user, readAt: null });
    prisma.notifications.update.mockResolvedValue({ id: other, readAt });
    const svc = new NotificationsService(prisma, redis);
    await expect(svc.markRead(user, other)).resolves.toEqual({ id: other, readAt });
    expect(redis.client.del).toHaveBeenCalledWith(`notif:unread:${user}`);
  });

  it('markAllRead only touches readAt IS NULL rows', async () => {
    const { prisma, redis } = makeMocks();
    prisma.notifications.updateMany.mockResolvedValue({ count: 4 });
    const svc = new NotificationsService(prisma, redis);
    await expect(svc.markAllRead(user)).resolves.toEqual({ marked: 4 });
    expect(prisma.notifications.updateMany).toHaveBeenCalledWith({
      where: { userId: user, readAt: null },
      data: { readAt: expect.any(Date) },
    });
    expect(redis.client.del).toHaveBeenCalledOnce();
  });
});

describe('NotificationsService.list', () => {
  it('fetches limit+1, trims, sets hasMore + cursor on the last row', async () => {
    const { prisma, redis } = makeMocks();
    const now = new Date();
    prisma.$queryRaw.mockResolvedValue(
      Array.from({ length: 3 }, (_, i) => ({
        id: other,
        type: 'NEW_MESSAGE',
        titleKey: 't',
        bodyKey: 'b',
        data: {},
        readAt: null,
        createdAt: new Date(now.getTime() - i * 1000),
      })),
    );
    const svc = new NotificationsService(prisma, redis);
    const res = await svc.list(user, undefined, 2);
    expect(res.data).toHaveLength(2);
    expect(res.meta.hasMore).toBe(true);
    expect(res.meta.nextCursor).toMatch(/^2026-\d{2}-\d{2}T.*\|.+/);
    expect(res.groups.bugun).toHaveLength(2);
  });

  it('a valid cursor becomes a keyset predicate parameter; garbage is ignored', async () => {
    const { prisma, redis } = makeMocks();
    prisma.$queryRaw.mockResolvedValue([]);
    const svc = new NotificationsService(prisma, redis);
    const cursor = `2026-09-11T12:00:00.000Z|${other}`;
    const res = await svc.list(user, cursor, 20);
    expect(res.meta.nextCursor).toBeNull();
    expect(res.meta.hasMore).toBe(false);
    const sql = prisma.$queryRaw.mock.calls[0]?.[0];
    expect(JSON.stringify(sql)).toContain('createdAt');
  });
});
