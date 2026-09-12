import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import Redis from 'ioredis';
import { tashkentDayNumber } from '@rentuz/contracts';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Phase 6 integration suite (6_Phase.md §3): notifications read surface +
 * listeners, price fan-out, daily rollup + cleanup jobs, owner analytics.
 * Runs against the stack configured in apps/api/.env (isolated phase-6 ports
 * in the parallel worktree: PostGIS :5435, Redis :6380).
 */

const DB_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5435/rentuz?schema=public&search_path=public,extensions';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6380';

let app: INestApplication;
let prisma: PrismaClient;
let redis: Redis;

async function boot(): Promise<void> {
  const { AppModule } = await import('../src/app.module.js');
  const { NestFactory } = await import('@nestjs/core');
  const { StandardSchemaValidationPipe } = await import('@nestjs/common');
  const cookieParser = (await import('cookie-parser')).default;
  app = await NestFactory.create(AppModule, { logger: false });
  app.use(cookieParser());
  app.useGlobalPipes(new StandardSchemaValidationPipe({ transform: true }));
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready'] });
  await app.init();
}

async function truncate(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "rentalRequests", "notifications", "refreshTokens", "phoneVerifications", "propertyViews", "propertyDailyStats", "messages", "conversationParticipants", "conversations", "favorites", "users" CASCADE;`,
  );
  await prisma.$executeRawUnsafe(`SET search_path TO public, extensions; DELETE FROM "propertyImages";`);
  await prisma.$executeRawUnsafe(`SET search_path TO public, extensions; DELETE FROM "properties";`);
  await redis.flushdb();
}

async function uniquePhone(): Promise<string> {
  const digits = randomBytes(4)
    .toString('hex')
    .split('')
    .map((c) => (parseInt(c, 16) % 10).toString())
    .join('')
    .slice(0, 9)
    .padStart(9, '5');
  return `+998${digits}`;
}

async function userToken(name = 'User'): Promise<{ token: string; userId: string; phone: string }> {
  const phone = await uniquePhone();
  const password = 'paroltest12345';
  const reg = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ name, phone, password })
    .expect(201);
  await request(app.getHttpServer())
    .post('/api/v1/auth/verify-phone')
    .send({ phone, code: reg.body.data.otpDev, purpose: 'REGISTRATION' })
    .expect(200);
  const login = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ phone, password })
    .expect(200);
  return { token: login.body.data.accessToken, userId: login.body.data.user.id, phone };
}

async function createProperty(ownerId: string, opts: Partial<{ priceUzs: bigint; status: string }> = {}) {
  return prisma.properties.create({
    data: {
      ownerId,
      slug: `p6-${randomBytes(6).toString('hex')}`,
      title: 'Phase 6 test uy',
      description: 'integration fixture listing for phase 6',
      type: 'APARTMENT',
      price: '500',
      priceUzs: opts.priceUzs ?? 5_000_000n,
      period: 'month',
      rooms: 2,
      bedrooms: 1,
      bathrooms: 1,
      area: '60',
      address: 'Test 1',
      amenities: [],
      status: (opts.status ?? 'ACTIVE') as 'ACTIVE',
      isVerified: true,
    },
  });
}

/** Fire-and-forget enqueue is async — poll instead of sleeping on races. */
async function waitFor<T>(fn: () => Promise<T>, ms = 3000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > ms) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
}

beforeAll(async () => {
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });
  redis = new Redis(REDIS_URL);
  await boot();
}, 60_000);

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  await redis?.quit();
});

beforeEach(async () => {
  await truncate();
});

describe('notifications read surface (§46)', () => {
  it('requires auth: unread-count anonymous → 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/notifications/unread-count').expect(401);
    await request(app.getHttpServer()).get('/api/v1/notifications').expect(401);
  });

  it('rental_request.created → owner row with idempotency key (replay-safe)', async () => {
    const owner = await userToken('Owner');
    const tenant = await userToken('Tenant');
    const property = await createProperty(owner.userId);

    const { EventBusService } = await import('../src/common/services/event-bus.service.js');
    const bus = app.get(EventBusService);
    const payload = {
      requestId: '11111111-1111-4111-8111-111111111111',
      tenantId: tenant.userId,
      ownerId: owner.userId,
      propertyId: property.id,
    };
    bus.emit('rental_request.created', payload);
    bus.emit('rental_request.created', payload); // buggy replay must NOT duplicate

    const rows = await waitFor(async () => {
      const found = await prisma.notifications.findMany({ where: { userId: owner.userId } });
      return found.length > 0 ? found : null;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('REQUEST_NEW');
    expect((rows[0].data as { key?: string }).key).toContain(':request.new:');
    expect(rows[0].titleKey).toBe('notifications.types.requestNew');
  });

  it('message.created enqueues for the recipient only (not the sender)', async () => {
    const a = await userToken('Alice');
    const b = await userToken('Bob');
    const { EventBusService } = await import('../src/common/services/event-bus.service.js');
    const bus = app.get(EventBusService);
    bus.emit('message.created', {
      conversationId: '22222222-2222-4222-8222-222222222222',
      senderId: a.userId,
      recipientId: b.userId,
      messageId: '33333333-3333-4333-8333-333333333333',
    });

    const rows = await waitFor(async () => {
      const found = await prisma.notifications.findMany({ where: { type: 'NEW_MESSAGE' } });
      return found.length > 0 ? found : null;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(b.userId);
  });

  it('unread-count is cached, mark-read invalidates it; cross-user → 403', async () => {
    const owner = await userToken('Owner');
    const other = await userToken('Other');
    const created = await prisma.notifications.create({
      data: {
        userId: owner.userId,
        type: 'REQUEST_ACCEPTED',
        titleKey: 'notifications.types.requestAccepted',
        bodyKey: 'request.accepted',
        data: { key: `req-test-${randomBytes(4).toString('hex')}` },
      },
    });

    const first = await request(app.getHttpServer())
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(first.body.data.count).toBe(1);

    // Other user must not be able to read/alter this notification.
    await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${created.id}/read`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${created.id}/read`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    const after = await request(app.getHttpServer())
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(after.body.data.count).toBe(0);
  });

  it('list groups by Tashkent day and paginates with a cursor', async () => {
    const user = await userToken('Pager');
    // Anchor at Tashkent midday so day-boundary flakes can't happen.
    const noonTak = (tashkentDayNumber(Date.now()) + 12) * 86_400_000 - 5 * 3_600_000;
    for (let i = 0; i < 5; i++) {
      await prisma.notifications.create({
        data: {
          userId: user.userId,
          type: 'PRICE_CHANGED',
          titleKey: 'notifications.types.priceChanged',
          bodyKey: 'price.changed',
          data: { key: `p6-pager-${i}` },
          // spread across today / 30-days-ago buckets, DESC on i=0
          createdAt: new Date(noonTak - i * (i === 1 ? 30 * 86_400_000 : 60_000)),
        },
      });
    }
    const page1 = await request(app.getHttpServer())
      .get('/api/v1/notifications?limit=2')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(page1.body.data.data).toHaveLength(2);
    expect(page1.body.data.meta.hasMore).toBe(true);
    expect(page1.body.data.groups.bugun.length + page1.body.data.groups.kecha.length).toBeGreaterThan(0);

    const page2 = await request(app.getHttpServer())
      .get(`/api/v1/notifications?limit=2&cursor=${encodeURIComponent(page1.body.data.meta.nextCursor)}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const ids = new Set([...page1.body.data.data.map((n: { id: string }) => n.id), ...page2.body.data.data.map((n: { id: string }) => n.id)]);
    expect(ids.size).toBe(4);

    await request(app.getHttpServer())
      .post('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const count = await request(app.getHttpServer())
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${user.token}`);
    expect(count.body.data.count).toBe(0);
  });

  it('price change on a favorited property → exactly the favoriting users notified', async () => {
    const owner = await userToken('Owner');
    const property = await createProperty(owner.userId, { priceUzs: 60_000_000n });
    const fans = await Promise.all([userToken('F1'), userToken('F2'), userToken('F3')]);
    for (const fan of fans) {
      await prisma.favorites.create({ data: { userId: fan.userId, propertyId: property.id } });
    }
    await userToken('NotAFan');

    await request(app.getHttpServer())
      .patch(`/api/v1/properties/${property.id}/price`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ price: 45_000_000, currency: 'UZS' })
      .expect(200);

    const rows = await waitFor(async () => {
      const found = await prisma.notifications.findMany({ where: { type: 'PRICE_CHANGED' } });
      return found.length >= 3 ? found : null;
    });
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.userId))).toEqual(new Set(fans.map((f) => f.userId)));
    expect((rows[0].data as { newPriceUzs?: number }).newPriceUzs).toBe(45_000_000);
  });
});

describe('daily-stats rollup + views rebuild (§1.2.6)', () => {
  it('30 synthetic view days → 30 rollup rows; re-run is a no-op', async () => {
    const owner = await userToken('Owner');
    const property = await createProperty(owner.userId);
    const fan = await userToken('Fan');

    for (let i = 0; i < 30; i++) {
      // 07:00 UTC == 12:00 Tashkent — mid-day, never a boundary race.
      const at = new Date(Date.now() - i * 86_400_000);
      at.setUTCHours(7, 0, 0, 0);
      await prisma.propertyViews.create({
        data: { propertyId: property.id, sessionId: `s-${i}`, createdAt: at },
      });
    }
    await prisma.favorites.create({ data: { userId: fan.userId, propertyId: property.id, createdAt: new Date() } });
    const yesterday = new Date(Date.now() - 86_400_000);
    await prisma.rentalRequests.create({
      data: {
        tenantId: fan.userId,
        ownerId: owner.userId,
        propertyId: property.id,
        message: 'Salom, bu uy bo‘yicha so‘rov yubormoqchiman',
        startDate: new Date(Date.UTC(2026, 9, 1)),
        durationMonths: 6,
        priceSnapshot: '500',
        currency: 'UZS',
        priceUzsSnapshot: 5_000_000n,
        status: 'ACCEPTED',
        decidedAt: yesterday,
        createdAt: yesterday,
      },
    });
    const conversation = await prisma.conversations.create({
      data: { tenantId: fan.userId, ownerId: owner.userId, propertyId: property.id },
    });
    await prisma.messages.create({
      data: { conversationId: conversation.id, senderId: fan.userId, text: 'Salom', attachments: [] },
    });

    const { DailyStatsProcessor } = await import('../src/modules/jobs/daily-stats.processor.js');
    const processor = new DailyStatsProcessor(prisma as never);
    const result = await processor.process({} as never);
    expect(result.rows).toBe(30); // one row per day for the single property

    const stats = await prisma.propertyDailyStats.findMany({ where: { propertyId: property.id } });
    expect(stats).toHaveLength(30);
    const totalViews = stats.reduce((s, r) => s + r.views, 0);
    expect(totalViews).toBe(30);
    const today = stats.find((s) => s.views === 1 && s.messages === 1);
    expect(today).toBeTruthy();
    expect(stats.some((s) => s.requests === 1 && s.accepted === 1)).toBe(true);

    // views counter rebuild (3_Phase.md §3 hand-off): properties.views == journal
    const prop = await prisma.properties.findUniqueOrThrow({
      where: { id: property.id },
      select: { views: true },
    });
    expect(Number(prop.views)).toBe(30);

    // Re-run: idempotent — same 30 rows, same sums.
    const again = await processor.process({} as never);
    expect(again.rows).toBe(30);
    const stats2 = await prisma.propertyDailyStats.findMany({ where: { propertyId: property.id } });
    expect(stats2).toHaveLength(30);
    expect(stats2.reduce((s, r) => s + r.views, 0)).toBe(30);
  });
});

describe('notifications cleanup (§1.2.7)', () => {
  it('deletes read >90d and unread >30d, keeps the rest', async () => {
    const user = await userToken('Old');
    const mk = (ageDays: number, read: boolean, tag: string) =>
      prisma.notifications.create({
        data: {
          userId: user.userId,
          type: 'PRICE_CHANGED',
          titleKey: 't',
          bodyKey: 'b',
          data: { key: `cleanup-${tag}` },
          readAt: read ? new Date(Date.now() - (ageDays - 1) * 86_400_000) : null,
          createdAt: new Date(Date.now() - ageDays * 86_400_000),
        },
      });
    await mk(100, true, 'read-old'); // deleted
    await mk(45, false, 'unread-old'); // deleted
    await mk(80, true, 'read-fresh'); // kept
    await mk(10, false, 'unread-fresh'); // kept

    const { NotificationsCleanupProcessor } = await import('../src/modules/jobs/notifications-cleanup.processor.js');
    const configStub = {
      get: (key: string) => (key === 'NOTIFICATIONS_READ_RETENTION_DAYS' ? 90 : 30),
    };
    const processor = new NotificationsCleanupProcessor(prisma as never, configStub as never);
    const result = await processor.process({} as never);
    expect(result.deleted).toBe(2);

    const remaining = await prisma.notifications.count();
    expect(remaining).toBe(2);
  });
});

describe('owner analytics (§50)', () => {
  async function seedActivity(ownerTokenUserId: string, tenantUserId: string, fanUserId: string) {
    const property = await createProperty(ownerTokenUserId);
    for (let i = 0; i < 10; i++) {
      const at = new Date(Date.now() - i * 86_400_000);
      at.setUTCHours(7, 0, 0, 0);
      await prisma.propertyViews.create({ data: { propertyId: property.id, sessionId: `x-${i}`, createdAt: at } });
    }
    await prisma.favorites.create({ data: { userId: fanUserId, propertyId: property.id } });
    await prisma.rentalRequests.createMany({
      data: [
        {
          tenantId: tenantUserId, ownerId: ownerTokenUserId, propertyId: property.id,
          message: 'So‘rov 1 — test uchun yetarlicha uzun matn', startDate: new Date(Date.UTC(2026, 9, 1)),
          durationMonths: 6, priceSnapshot: '500', currency: 'UZS', priceUzsSnapshot: 5_000_000n,
          status: 'ACCEPTED', decidedAt: new Date(), createdAt: new Date(),
        },
        {
          tenantId: tenantUserId, ownerId: ownerTokenUserId, propertyId: property.id,
          message: 'So‘rov 2 — test uchun yetarlicha uzun matn', startDate: new Date(Date.UTC(2026, 9, 1)),
          durationMonths: 6, priceSnapshot: '500', currency: 'UZS', priceUzsSnapshot: 5_000_000n,
          status: 'REJECTED', decidedAt: new Date(), createdAt: new Date(),
        },
      ],
    });
    const conversation = await prisma.conversations.create({
      data: { tenantId: tenantUserId, ownerId: ownerTokenUserId, propertyId: property.id },
    });
    await prisma.messages.createMany({
      data: [1, 2, 3].map((n) => ({
        conversationId: conversation.id,
        senderId: tenantUserId,
        text: `xabar ${n}`,
        attachments: [],
      })),
    });
    return property;
  }

  it('runs rollup then /owner/analytics?range=30d matches DB ground truth', async () => {
    const owner = await userToken('Owner');
    const tenant = await userToken('Tenant');
    const fan = await userToken('Fan');
    const property = await seedActivity(owner.userId, tenant.userId, fan.userId);

    const { DailyStatsProcessor } = await import('../src/modules/jobs/daily-stats.processor.js');
    await new DailyStatsProcessor(prisma as never).process({} as never);

    // Ground truth straight from the base tables (docs §3: cross-check raw).
    const [rawViews, rawFav, rawMsg, rawDecided, rawAccepted] = await Promise.all([
      prisma.propertyViews.count({ where: { propertyId: property.id } }),
      prisma.favorites.count({ where: { propertyId: property.id } }),
      prisma.messages.count(),
      prisma.rentalRequests.count({
        where: { propertyId: property.id, status: { in: ['ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED'] } },
      }),
      prisma.rentalRequests.count({ where: { propertyId: property.id, status: 'ACCEPTED' } }),
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/owner/analytics?range=30d')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    const body = res.body.data;
    expect(body.overview.views).toBe(rawViews);
    expect(body.overview.favorites).toBe(rawFav);
    expect(body.overview.messages).toBe(rawMsg);
    expect(body.overview.requests).toBeGreaterThanOrEqual(2);
    // conversion is decisions-based: accepted/decided, exactly as the seed.
    expect(body.overview.conversion).toBe(
      rawDecided === 0 ? 0 : Number((rawAccepted / rawDecided).toFixed(4)),
    );
    expect(body.granularity).toBe('day');
    expect(body.series).toHaveLength(30);
    expect(body.topProperties[0].propertyId).toBe(property.id);

    // custom range (today only) skips the rollup and aggregates live.
    const today = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
    const custom = await request(app.getHttpServer())
      .get(`/api/v1/owner/analytics?range=custom&from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(custom.body.data.granularity).toBe('day');
  });

  it('a regular USER with no listings gets zeros — not an error; custom without dates → 400', async () => {
    const lonely = await userToken('Lonely');
    const res = await request(app.getHttpServer())
      .get('/api/v1/owner/analytics')
      .set('Authorization', `Bearer ${lonely.token}`)
      .expect(200);
    expect(res.body.data.overview).toEqual({
      views: 0,
      favorites: 0,
      messages: 0,
      requests: 0,
      conversion: 0,
    });
    expect(res.body.data.series).toHaveLength(30); // zero-filled

    await request(app.getHttpServer())
      .get('/api/v1/owner/analytics?range=custom')
      .set('Authorization', `Bearer ${lonely.token}`)
      .expect(400);
  });
});

describe('notification enqueue load (§4 DoD)', () => {
  it(
    '10k enqueues in <60s with duplicate keys dedupe cleanly',
    async () => {
    const user = await userToken('Load');
    const { NotificationsService } = await import('../src/modules/notifications/notifications.service.js');
    const svc = app.get(NotificationsService);
    const start = Date.now();
    const tasks: Promise<boolean>[] = [];
    // 2,000 distinct facts, each emitted 5× (a buggy emitter replaying).
    for (let round = 0; round < 5; round++) {
      for (let i = 0; i < 2000; i++) {
        tasks.push(
          svc.enqueue({
            userId: user.userId,
            type: 'PRICE_CHANGED',
            titleKey: 'notifications.types.priceChanged',
            bodyKey: 'price.changed',
            data: { key: `load:${i}`, attempt: round },
          }),
        );
      }
    }
    const results = await Promise.allSettled(tasks);
    const elapsed = Date.now() - start;
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    const inserted = results.filter(
      (r) => r.status === 'fulfilled' && r.value === true,
    ).length;
    expect(inserted).toBe(2000); // dedup by (userId, type, data.key)
    const count = await prisma.notifications.count({ where: { userId: user.userId } });
    expect(count).toBe(2000);
    expect(elapsed).toBeLessThan(60_000);
    },
    // The DoD budget is 60 s; give vitest headroom so a warm run is never
    // killed mid-flight (leaked background inserts pollute later files).
    120_000,
  );
});
