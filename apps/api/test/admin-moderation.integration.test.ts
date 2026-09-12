import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import Redis from 'ioredis';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Phase 7 integration suite (7_Phase.md §3): verification queue, reports,
 * admin users/properties, audit trail, runtime flags. Runs against the
 * isolated phase-7 stack (PostGIS :5436, Redis :6381) from apps/api/.env.
 *
 * Trap 14: guards read role/status from the JWT claim — tests flip the user
 * row BEFORE logging in, or the guard sees the stale claim.
 */

const DB_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5436/rentuz?schema=public&search_path=public,extensions';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6381';

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
    `TRUNCATE TABLE "auditLogs", "reports", "rentalRequests", "notifications", "refreshTokens", "phoneVerifications", "propertyViews", "propertyDailyStats", "messages", "conversationParticipants", "conversations", "favorites", "users" CASCADE;`,
  );
  await prisma.$executeRawUnsafe(`SET search_path TO public, extensions; DELETE FROM "propertyImages";`);
  await prisma.$executeRawUnsafe(`SET search_path TO public, extensions; DELETE FROM "properties";`);
  await redis.flushdb();
}

function randomId(): string {
  return randomBytes(4).toString('hex');
}

async function uniquePhone(): Promise<string> {
  const digits = randomId()
    .split('')
    .map((c) => (parseInt(c, 16) % 10).toString())
    .join('')
    .slice(0, 9)
    .padStart(9, '5');
  return `+998${digits}`;
}

const PASSWORD = 'paroltest12345';

async function registerUser(name = 'User'): Promise<{ userId: string; phone: string; token: string }> {
  const phone = await uniquePhone();
  const reg = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ name, phone, password: PASSWORD })
    .expect(201);
  await request(app.getHttpServer())
    .post('/api/v1/auth/verify-phone')
    .send({ phone, code: reg.body.data.otpDev, purpose: 'REGISTRATION' })
    .expect(200);
  const login = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ phone, password: PASSWORD })
    .expect(200);
  return { userId: login.body.data.user.id, phone, token: login.body.data.accessToken };
}

async function login(phone: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ phone, password: PASSWORD })
    .expect(200);
  return res.body.data.accessToken;
}

/** Register, promote in the DB, then log in so the JWT carries ADMIN/ACTIVE. */
async function makeAdmin(name = 'Admin'): Promise<{ userId: string; phone: string; token: string }> {
  const user = await registerUser(name);
  await prisma.users.update({ where: { id: user.userId }, data: { role: 'ADMIN', status: 'ACTIVE' } });
  const token = await login(user.phone);
  return { ...user, token };
}

async function makeProperty(
  ownerId: string,
  opts: Partial<{ status: string; isVerified: boolean; title: string }> = {},
) {
  return prisma.properties.create({
    data: {
      ownerId,
      slug: `p7-${randomId()}`,
      title: opts.title ?? 'Phase 7 test uy',
      description: 'integration fixture listing for phase 7',
      type: 'APARTMENT',
      price: '500',
      priceUzs: 5_000_000n,
      period: 'month',
      rooms: 2,
      bedrooms: 1,
      bathrooms: 1,
      area: '60',
      address: 'Test 1',
      amenities: [],
      status: (opts.status ?? 'PENDING_VERIFICATION') as 'PENDING_VERIFICATION',
      isVerified: opts.isVerified ?? false,
      submittedAt: new Date(),
    },
  });
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function waitFor<T>(fn: () => Promise<T>, ms = 4000): Promise<T> {
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

describe('§60 verification queue', () => {
  it('pending → claim → approve: ACTIVE + verified fields + audit row + notification', async () => {
    const admin = await makeAdmin();
    const owner = await registerUser('Owner');
    const property = await makeProperty(owner.userId);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/verification/${property.id}/claim`)
      .set(auth(admin.token))
      .expect(200);

    const queue = await request(app.getHttpServer())
      .get('/api/v1/admin/verification?status=REVIEWING')
      .set(auth(admin.token))
      .expect(200);
    expect(queue.body.data.data.map((row: { id: string }) => row.id)).toContain(property.id);

    const approve = await request(app.getHttpServer())
      .post(`/api/v1/admin/verification/${property.id}/approve`)
      .set(auth(admin.token))
      .expect(200);
    expect(approve.body.data.status).toBe('ACTIVE');

    const row = await prisma.properties.findUnique({ where: { id: property.id } });
    expect(row?.status).toBe('ACTIVE');
    expect(row?.isVerified).toBe(true);
    expect(row?.verifiedBy).toBe(admin.userId);
    expect(row?.verifiedAt).toBeInstanceOf(Date);

    const audit = await prisma.auditLogs.findFirst({ where: { action: 'PROPERTY_APPROVED' } });
    expect(audit?.adminId).toBe(admin.userId);
    expect(audit?.targetId).toBe(property.id);

    const notification = await waitFor(() =>
      prisma.notifications.findFirst({ where: { userId: owner.userId, type: 'PROPERTY_VERIFIED' } }),
    );
    expect(notification?.type).toBe('PROPERTY_VERIFIED');
  });

  it('reject: reason <10 → 400; ≥10 → REJECTED + rejectionReason + audit + notification', async () => {
    const admin = await makeAdmin();
    const owner = await registerUser('Owner');
    const property = await makeProperty(owner.userId);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/verification/${property.id}/reject`)
      .set(auth(admin.token))
      .send({ reason: 'qisqa' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/verification/${property.id}/reject`)
      .set(auth(admin.token))
      .send({ reason: 'rasmlar juda past sifatli' })
      .expect(200);

    const row = await prisma.properties.findUnique({ where: { id: property.id } });
    expect(row?.status).toBe('REJECTED');
    expect(row?.rejectionReason).toBe('rasmlar juda past sifatli');
    expect(await prisma.auditLogs.count({ where: { action: 'PROPERTY_REJECTED' } })).toBe(1);
    await waitFor(() =>
      prisma.notifications.findFirst({ where: { userId: owner.userId, type: 'PROPERTY_REJECTED' } }),
    );
  });

  it('suspended owner: approve → 409 OWNER_SUSPENDED and no state change', async () => {
    const admin = await makeAdmin();
    const owner = await registerUser('Owner');
    const property = await makeProperty(owner.userId);
    await prisma.users.update({ where: { id: owner.userId }, data: { status: 'SUSPENDED' } });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/verification/${property.id}/approve`)
      .set(auth(admin.token))
      .expect(409);
    expect(res.body.error.code).toBe('OWNER_SUSPENDED');

    const row = await prisma.properties.findUnique({ where: { id: property.id } });
    expect(row?.status).toBe('PENDING_VERIFICATION');
  });

  it('request-info: status unchanged + VERIFICATION_INFO_REQUESTED notification + audit', async () => {
    const admin = await makeAdmin();
    const owner = await registerUser('Owner');
    const property = await makeProperty(owner.userId);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/verification/${property.id}/request-info`)
      .set(auth(admin.token))
      .send({ message: 'iltimos mulk egasi bilan tasdiqlovchi hujjat yuboring' })
      .expect(200);

    const row = await prisma.properties.findUnique({ where: { id: property.id } });
    expect(row?.status).toBe('PENDING_VERIFICATION');
    expect(await prisma.auditLogs.count({ where: { action: 'VERIFICATION_INFO_REQUESTED' } })).toBe(1);
    await waitFor(() =>
      prisma.notifications.findFirst({ where: { userId: owner.userId, type: 'VERIFICATION_INFO_REQUESTED' } }),
    );
  });
});

describe('§61 reports', () => {
  it('self-report → 400; duplicate open → 409; priority auto-derived', async () => {
    const owner = await registerUser('Owner');
    const reporter = await registerUser('Reporter');
    const property = await makeProperty(owner.userId, { status: 'ACTIVE' });

    const self = await request(app.getHttpServer())
      .post('/api/v1/reports')
      .set(auth(owner.token))
      .send({ targetType: 'PROPERTY', targetId: property.id, reason: 'SCAM' })
      .expect(400);
    expect(self.body.error.code).toBe('CANNOT_REPORT_SELF');

    const created = await request(app.getHttpServer())
      .post('/api/v1/reports')
      .set(auth(reporter.token))
      .send({ targetType: 'PROPERTY', targetId: property.id, reason: 'SCAM' })
      .expect(201);
    expect(created.body.data.priority).toBe('HIGH');

    const dup = await request(app.getHttpServer())
      .post('/api/v1/reports')
      .set(auth(reporter.token))
      .send({ targetType: 'PROPERTY', targetId: property.id, reason: 'SCAM' })
      .expect(409);
    expect(dup.body.error.code).toBe('REPORT_ALREADY_OPEN');
  });

  it('resolve + suspendTarget → target SUSPENDED + tokens revoked + RESOLVED', async () => {
    const admin = await makeAdmin();
    const owner = await registerUser('Owner');
    const reporter = await registerUser('Reporter');
    const property = await makeProperty(owner.userId, { status: 'ACTIVE' });
    const created = await request(app.getHttpServer())
      .post('/api/v1/reports')
      .set(auth(reporter.token))
      .send({ targetType: 'PROPERTY', targetId: property.id, reason: 'SCAM' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/reports/${created.body.data.id}`)
      .set(auth(admin.token))
      .send({ action: 'RESOLVED', note: 'firibgarlik tasdiqlandi', suspendTarget: true })
      .expect(200);

    const ownerRow = await prisma.users.findUnique({ where: { id: owner.userId } });
    expect(ownerRow?.status).toBe('SUSPENDED');
    expect(await prisma.refreshTokens.count({ where: { userId: owner.userId, revokedAt: null } })).toBe(0);
    const report = await prisma.reports.findUnique({ where: { id: created.body.data.id } });
    expect(report?.status).toBe('RESOLVED');
    expect(await prisma.auditLogs.count({ where: { action: 'REPORT_RESOLVED' } })).toBe(1);
  });

  it('resolve + removeListing → property DELETED', async () => {
    const admin = await makeAdmin();
    const owner = await registerUser('Owner');
    const reporter = await registerUser('Reporter');
    const property = await makeProperty(owner.userId, { status: 'ACTIVE' });
    const created = await request(app.getHttpServer())
      .post('/api/v1/reports')
      .set(auth(reporter.token))
      .send({ targetType: 'PROPERTY', targetId: property.id, reason: 'INAPPROPRIATE' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/reports/${created.body.data.id}`)
      .set(auth(admin.token))
      .send({ action: 'RESOLVED', removeListing: true })
      .expect(200);

    const row = await prisma.properties.findUnique({ where: { id: property.id } });
    expect(row?.status).toBe('DELETED');
  });

  it('escalate → CRITICAL + REPORT_ESCALATED audit', async () => {
    const admin = await makeAdmin();
    const owner = await registerUser('Owner');
    const reporter = await registerUser('Reporter');
    const property = await makeProperty(owner.userId, { status: 'ACTIVE' });
    const created = await request(app.getHttpServer())
      .post('/api/v1/reports')
      .set(auth(reporter.token))
      .send({ targetType: 'PROPERTY', targetId: property.id, reason: 'OTHER' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/reports/${created.body.data.id}`)
      .set(auth(admin.token))
      .send({ action: 'ESCALATED' })
      .expect(200);

    const report = await prisma.reports.findUnique({ where: { id: created.body.data.id } });
    expect(report?.priority).toBe('CRITICAL');
    expect(report?.status).toBe('OPEN');
    expect(await prisma.auditLogs.count({ where: { action: 'REPORT_ESCALATED' } })).toBe(1);
  });
});

describe('§58 admin users', () => {
  it('bulk suspend: 10 users, 1 deleted → 9 succeeded / 1 failed', async () => {
    const admin = await makeAdmin();
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const user = await registerUser(`Bulk ${i}`);
      ids.push(user.userId);
    }
    await prisma.users.update({ where: { id: ids[0] }, data: { status: 'DELETED' } });

    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/users/bulk/suspend')
      .set(auth(admin.token))
      .send({ userIds: ids, reason: 'ommaviy tekshiruv natijasi' })
      .expect(201);

    expect(res.body.data.counts).toEqual({ succeeded: 9, failed: 1 });
    expect(res.body.data.failed[0].userId).toBe(ids[0]);
    expect(await prisma.auditLogs.count({ where: { action: 'USER_BULK_SUSPENDED' } })).toBe(1);
  });

  it('suspend cascades property pause; activate restores only OWNER_SUSPENDED rows', async () => {
    const admin = await makeAdmin();
    const owner = await registerUser('Owner');
    const active = await makeProperty(owner.userId, { status: 'ACTIVE', isVerified: true });
    const ownerPaused = await makeProperty(owner.userId, { status: 'PAUSED' });
    await prisma.properties.update({ where: { id: ownerPaused.id }, data: { pausedReason: 'OWNER' } });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${owner.userId}/status`)
      .set(auth(admin.token))
      .send({ status: 'SUSPENDED', reason: 'shikoyatlar ko‘paygan' })
      .expect(200);

    const paused = await prisma.properties.findUnique({ where: { id: active.id } });
    expect(paused?.status).toBe('PAUSED');
    expect(paused?.pausedReason).toBe('OWNER_SUSPENDED');

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${owner.userId}/status`)
      .set(auth(admin.token))
      .send({ status: 'ACTIVE' })
      .expect(200);

    const restored = await prisma.properties.findUnique({ where: { id: active.id } });
    expect(restored?.status).toBe('ACTIVE');
    expect(restored?.pausedReason).toBeNull();
    const stillPaused = await prisma.properties.findUnique({ where: { id: ownerPaused.id } });
    expect(stillPaused?.status).toBe('PAUSED');
  });
});

describe('§59 admin properties', () => {
  it('REJECTED without reason → 400; PAUSED sets pausedReason=ADMIN', async () => {
    const admin = await makeAdmin();
    const owner = await registerUser('Owner');
    const property = await makeProperty(owner.userId, { status: 'ACTIVE', isVerified: true });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/properties/${property.id}/status`)
      .set(auth(admin.token))
      .send({ status: 'REJECTED' })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/properties/${property.id}/status`)
      .set(auth(admin.token))
      .send({ status: 'PAUSED' })
      .expect(200);

    const row = await prisma.properties.findUnique({ where: { id: property.id } });
    expect(row?.status).toBe('PAUSED');
    expect(row?.pausedReason).toBe('ADMIN');
    expect(await prisma.auditLogs.count({ where: { action: 'PROPERTY_PAUSED' } })).toBe(1);
  });
});

describe('§73 audit trail + §49 access control', () => {
  it('lists mixed admin actions in reverse chronological order', async () => {
    const admin = await makeAdmin();
    const owner = await registerUser('Owner');
    const reporter = await registerUser('Reporter');
    const property = await makeProperty(owner.userId, { status: 'ACTIVE', isVerified: true });

    // 1) property pause
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/properties/${property.id}/status`)
      .set(auth(admin.token))
      .send({ status: 'PAUSED' })
      .expect(200);
    // 2) property resume
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/properties/${property.id}/status`)
      .set(auth(admin.token))
      .send({ status: 'ACTIVE' })
      .expect(200);
    // 3) flag update
    await request(app.getHttpServer())
      .patch('/api/v1/admin/flags')
      .set(auth(admin.token))
      .send({ AUTO_APPROVE_LISTINGS: true })
      .expect(200);
    // 4) report escalate
    const created = await request(app.getHttpServer())
      .post('/api/v1/reports')
      .set(auth(reporter.token))
      .send({ targetType: 'PROPERTY', targetId: property.id, reason: 'OTHER' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/reports/${created.body.data.id}`)
      .set(auth(admin.token))
      .send({ action: 'ESCALATED' })
      .expect(200);
    // 5) user suspend
    const victim = await registerUser('Victim');
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${victim.userId}/status`)
      .set(auth(admin.token))
      .send({ status: 'SUSPENDED', reason: 'tekshiruv uchun sabab' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/audit?limit=50')
      .set(auth(admin.token))
      .expect(200);
    expect(res.body.data.data).toHaveLength(5);
    const times = res.body.data.data.map((row: { createdAt: string }) => Date.parse(row.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(res.body.data.data[0].adminId).toBe(admin.userId);
  });

  it('non-admin → 403; suspended admin → 403', async () => {
    const user = await registerUser('Plain');
    await request(app.getHttpServer()).get('/api/v1/admin/analytics').set(auth(user.token)).expect(403);

    const admin = await makeAdmin('Suspended Admin');
    await prisma.users.update({ where: { id: admin.userId }, data: { status: 'SUSPENDED' } });
    const suspendedToken = await login(admin.phone);
    await request(app.getHttpServer()).get('/api/v1/admin/analytics').set(auth(suspendedToken)).expect(403);
  });

  it('audit adminId comes from the JWT subject, never the body', async () => {
    const admin = await makeAdmin();
    const owner = await registerUser('Owner');
    const property = await makeProperty(owner.userId);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/verification/${property.id}/reject`)
      .set(auth(admin.token))
      .send({ reason: 'sifatli emas', adminId: '00000000-0000-0000-0000-000000000000' })
      .expect(200);
    const audit = await prisma.auditLogs.findFirst({ where: { action: 'PROPERTY_REJECTED' } });
    expect(audit?.adminId).toBe(admin.userId);
  });
});

describe('§98 reports rate limit', () => {
  it('the 11th report in an hour → 429', async () => {
    const previous = process.env.DISABLE_THROTTLE;
    process.env.DISABLE_THROTTLE = 'false';
    try {
      const reporter = await registerUser('Reporter');
      const owner = await registerUser('Owner');
      for (let i = 0; i < 10; i++) {
        const property = await makeProperty(owner.userId, { status: 'ACTIVE' });
        await request(app.getHttpServer())
          .post('/api/v1/reports')
          .set(auth(reporter.token))
          .send({ targetType: 'PROPERTY', targetId: property.id, reason: 'OTHER' })
          .expect(201);
      }
      const property = await makeProperty(owner.userId, { status: 'ACTIVE' });
      await request(app.getHttpServer())
        .post('/api/v1/reports')
        .set(auth(reporter.token))
        .send({ targetType: 'PROPERTY', targetId: property.id, reason: 'OTHER' })
        .expect(429);
    } finally {
      process.env.DISABLE_THROTTLE = previous;
    }
  });
});

describe('§5 runtime feature flags', () => {
  it('AUTO_APPROVE_LISTINGS=false takes effect on the next submit without restart', async () => {
    const admin = await makeAdmin();
    const owner = await registerUser('Owner');

    await request(app.getHttpServer())
      .patch('/api/v1/admin/flags')
      .set(auth(admin.token))
      .send({ AUTO_APPROVE_LISTINGS: false })
      .expect(200);

    // A draft that is complete enough to submit (mirrors the FULL_VALIDATION_KEYS gate).
    const region = await prisma.locations.findFirstOrThrow({ where: { kind: 'REGION' } });
    const draft = await request(app.getHttpServer())
      .post('/api/v1/properties')
      .set(auth(owner.token))
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/properties/${draft.body.data.id}`)
      .set(auth(owner.token))
      .send({
        title: 'Phase 7 submit fixture',
        description: 'To‘liq tavsif: submit gate dan o‘tish uchun yetarli matn.',
        type: 'APARTMENT',
        price: 5_000_000,
        rooms: 2,
        bedrooms: 1,
        bathrooms: 1,
        area: 60,
        address: 'Test manzil 1',
        regionId: region.id,
        amenities: ['wifi'],
      })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/properties/${draft.body.data.id}/submit`)
      .set(auth(owner.token))
      .expect(200);

    const row = await prisma.properties.findUnique({ where: { id: draft.body.data.id } });
    expect(row?.status).toBe('PENDING_VERIFICATION');

    const flags = await request(app.getHttpServer())
      .get('/api/v1/admin/flags')
      .set(auth(admin.token))
      .expect(200);
    const flag = flags.body.data.flags.find((f: { name: string }) => f.name === 'AUTO_APPROVE_LISTINGS');
    expect(flag.source).toBe('override');
    expect(flag.value).toBe(false);

    // Restore the default for later suites/runs.
    await request(app.getHttpServer())
      .patch('/api/v1/admin/flags')
      .set(auth(admin.token))
      .send({ AUTO_APPROVE_LISTINGS: true })
      .expect(200);
  });
});
