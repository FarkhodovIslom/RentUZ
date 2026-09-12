import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import Redis from 'ioredis';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Phase 4 integration suite — rental request lifecycle (4_Phase.md §3):
 * create/snapshot/duplicate rules, race-safe accept, role gates, jobs.
 * Runs against the live docker stack (PostGIS :5434, Redis :6379).
 */

const DB_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5434/rentuz?schema=public&search_path=public,extensions';

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
    `TRUNCATE TABLE "rentalRequests", "notifications", "refreshTokens", "phoneVerifications", "propertyViews", "favorites", "users" CASCADE;`,
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

async function userToken(
  name = 'User',
  _opts: { canListProperties?: boolean } = {},
): Promise<{ token: string; userId: string; phone: string }> {
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

async function createProperty(ownerId: string, status = 'ACTIVE'): Promise<{ id: string; slug: string }> {
  return prisma.properties.create({
    data: {
      ownerId,
      slug: `fixture-${randomBytes(6).toString('hex')}`,
      title: 'Fixture property',
      description: 'Fixture description for integration tests.',
      type: 'APARTMENT',
      price: '1000000',
      currency: 'UZS',
      priceUzs: 1_000_000n,
      period: 'month',
      rooms: 2,
      bedrooms: 1,
      bathrooms: 1,
      area: '60',
      floor: 3,
      furnished: 'NONE',
      petsAllowed: false,
      address: 'Fixture address 1',
      amenities: ['wifi'],
      status,
      isVerified: true,
      views: 0,
    },
    select: { id: true, slug: true },
  });
}

function requestPayload(propertyId: string, overrides: Record<string, unknown> = {}) {
  const day = 24 * 60 * 60 * 1000;
  return {
    propertyId,
    message: 'Salom, bu uy ijaraga olishim mumkinmi? Jarayonni muhokama qilsak.',
    startDate: new Date(Date.now() + 7 * day).toISOString(),
    durationMonths: 12,
    ...overrides,
  };
}

type ExpectedNotif = { userId: string; type: string };
type Notif = Awaited<ReturnType<typeof prisma.notifications.findMany>>[number];

/**
 * Notification listeners are fire-and-forget with async enrichment, so rows
 * land a few event-loop turns after the request returns. Poll until every
 * expected (userId,type) pair is present or the deadline passes, then return
 * the per-user rows (final assertion still uses expect()).
 */
async function waitForNotifications(expected: ExpectedNotif[], ms = 5000): Promise<Notif[][]> {
  const deadline = Date.now() + ms;
  let byUser: Notif[][] = [];
  for (;;) {
    byUser = await Promise.all(
      expected.map((e) => prisma.notifications.findMany({ where: { userId: e.userId } })),
    );
    const allPresent = expected.every(
      (e, i) => byUser[i]?.some((n) => n.type === e.type) ?? false,
    );
    if (allPresent || Date.now() > deadline) return byUser;
    await new Promise((r) => setTimeout(r, 100));
  }
}

beforeAll(async () => {
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });
  redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  await boot();
}, 30_000);

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  await redis?.quit();
}, 30_000);

beforeEach(async () => {
  await truncate();
});

describe('POST /api/v1/rental-requests', () => {
  it('creates a PENDING request with a frozen price snapshot', async () => {
    const owner = await userToken('Owner');
    const property = await createProperty(owner.userId);
    const tenant = await userToken('Tenant');

    const res = await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send(requestPayload(property.id))
      .expect(201);

    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.priceSnapshot).toBe(1_000_000);
    expect(res.body.data.priceUzsSnapshot).toBe(1_000_000);
    expect(res.body.data.endDate).toBeDefined();
  });

  it('rejects a duplicate PENDING for the same tenant+property (partial unique index)', async () => {
    const owner = await userToken('Owner');
    const property = await createProperty(owner.userId);
    const tenant = await userToken('Tenant');
    await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send(requestPayload(property.id))
      .expect(201);

    const dup = await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send(requestPayload(property.id));
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_PENDING_REQUEST');
  });

  it('allows different tenants to hold PENDING requests on the same property', async () => {
    const owner = await userToken('Owner');
    const property = await createProperty(owner.userId);
    const t1 = await userToken('Tenant1');
    const t2 = await userToken('Tenant2');

    await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${t1.token}`)
      .send(requestPayload(property.id))
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${t2.token}`)
      .send(requestPayload(property.id))
      .expect(201);
  });

  it('blocks the owner requesting their own property (403)', async () => {
    const owner = await userToken('Owner');
    const property = await createProperty(owner.userId);
    const res = await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${owner.token}`)
      .send(requestPayload(property.id));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('blocks requests against non-ACTIVE properties (409 PROPERTY_NOT_AVAILABLE)', async () => {
    const owner = await userToken('Owner');
    const rented = await createProperty(owner.userId, 'RENTED');
    const tenant = await userToken('Tenant');
    const res = await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send(requestPayload(rented.id));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PROPERTY_NOT_AVAILABLE');
  });

  it('blocks a suspended tenant (global SuspendedGuard)', async () => {
    const owner = await userToken('Owner');
    const property = await createProperty(owner.userId);
    // The guard reads the `status` claim from the JWT — suspend BEFORE login
    // so the token carries SUSPENDED.
    const phone = await uniquePhone();
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'SuspendedTenant', phone, password: 'paroltest12345' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-phone')
      .send({ phone, code: reg.body.data.otpDev, purpose: 'REGISTRATION' })
      .expect(200);
    await prisma.users.update({ where: { phone }, data: { status: 'SUSPENDED' } });
    const suspendedLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ phone, password: 'paroltest12345' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${suspendedLogin.body.data.accessToken}`)
      .send(requestPayload(property.id));
    expect(res.status).toBe(403);
  });

  it('anonymous create → 401', async () => {
    const owner = await userToken('Owner');
    const property = await createProperty(owner.userId);
    await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .send(requestPayload(property.id))
      .expect(401);
  });

  it('enqueues a REQUEST_NEW notification for the owner', async () => {
    const owner = await userToken('Owner');
    const property = await createProperty(owner.userId);
    const tenant = await userToken('Tenant');
    await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send(requestPayload(property.id))
      .expect(201);

    const [notifs] = await waitForNotifications([
      { userId: owner.userId, type: 'REQUEST_NEW' },
    ]);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe('REQUEST_NEW');
  });
});

describe('PATCH /api/v1/rental-requests/:id (accept flow)', () => {
  it('owner accepts → ACCEPTED, property RENTED, competitors auto-REJECTED, notifications emitted', async () => {
    const owner = await userToken('Owner');
    const property = await createProperty(owner.userId);
    const t1 = await userToken('Tenant1');
    const t2 = await userToken('Tenant2');
    const r1 = await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${t1.token}`)
      .send(requestPayload(property.id))
      .expect(201);
    const r2 = await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${t2.token}`)
      .send(requestPayload(property.id))
      .expect(201);

    const accepted = await request(app.getHttpServer())
      .patch(`/api/v1/rental-requests/${r1.body.data.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: 'ACCEPTED' })
      .expect(200);
    expect(accepted.body.data.status).toBe('ACCEPTED');

    expect((await prisma.properties.findUniqueOrThrow({ where: { id: property.id } })).status).toBe('RENTED');

    const loser = await prisma.rentalRequests.findUniqueOrThrow({ where: { id: r2.body.data.id } });
    expect(loser.status).toBe('REJECTED');
    expect(loser.decisionNote).toContain('property rented');

    // Tenant winner notified (accepted); loser tenant notified (rejected).
    // Phase 6's listeners are fire-and-forget AND do an async enrichment
    // lookup before the idempotent insert, so poll instead of reading once.
    const [t1Notifs, t2Notifs] = await waitForNotifications([
      { userId: t1.userId, type: 'REQUEST_ACCEPTED' },
      { userId: t2.userId, type: 'REQUEST_REJECTED' },
    ]);
    expect(t1Notifs.some((n) => n.type === 'REQUEST_ACCEPTED')).toBe(true);
    expect(t2Notifs.some((n) => n.type === 'REQUEST_REJECTED')).toBe(true);
  });

  it('two owners race accepting competing PENDINGs on one property — exactly one wins', async () => {
    const owner = await userToken('Owner');
    const property = await createProperty(owner.userId);
    const t1 = await userToken('Tenant1');
    const t2 = await userToken('Tenant2');
    const r1 = await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${t1.token}`)
      .send(requestPayload(property.id))
      .expect(201);
    const r2 = await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${t2.token}`)
      .send(requestPayload(property.id))
      .expect(201);

    // Same owner accepting two competing requests concurrently: the FOR UPDATE
    // lock + conditional PENDING updates serialize the calls — the first
    // commits (property RENTED, both requests decided), the second sees a
    // decided request / non-ACTIVE property and 409s.
    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/api/v1/rental-requests/${r1.body.data.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ status: 'ACCEPTED' }),
      request(app.getHttpServer())
        .patch(`/api/v1/rental-requests/${r2.body.data.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ status: 'ACCEPTED' }),
    ]);
    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  it('a tenant cannot accept a request (403)', async () => {
    const owner = await userToken('Owner');
    const property = await createProperty(owner.userId);
    const tenant = await userToken('Tenant');
    const created = await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send(requestPayload(property.id))
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/rental-requests/${created.body.data.id}`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ status: 'ACCEPTED' });
    expect(res.status).toBe(403);
  });

  it('another owner cannot operate on the request (403)', async () => {
    const owner = await userToken('Owner');
    const property = await createProperty(owner.userId);
    const tenant = await userToken('Tenant');
    const otherOwner = await userToken('OtherOwner');
    const created = await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send(requestPayload(property.id))
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/rental-requests/${created.body.data.id}`)
      .set('Authorization', `Bearer ${otherOwner.token}`)
      .send({ status: 'REJECTED' });
    expect(res.status).toBe(403);
  });
});

describe('reject / cancel', () => {
  it('owner rejects with a note → REJECTED + decisionNote persisted', async () => {
    const owner = await userToken('Owner');
    const property = await createProperty(owner.userId);
    const tenant = await userToken('Tenant');
    const created = await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send(requestPayload(property.id))
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/rental-requests/${created.body.data.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: 'REJECTED', note: 'Boshqa tanlov' })
      .expect(200);
    expect(res.body.data.status).toBe('REJECTED');
    expect(res.body.data.decisionNote).toBe('Boshqa tanlov');
  });

  it('tenant cancels their own PENDING; the owner cannot cancel; property stays ACTIVE', async () => {
    const owner = await userToken('Owner');
    const property = await createProperty(owner.userId);
    const tenant = await userToken('Tenant');
    const created = await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send(requestPayload(property.id))
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/rental-requests/${created.body.data.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: 'CANCELLED' })
      .expect(403);

    const cancelled = await request(app.getHttpServer())
      .patch(`/api/v1/rental-requests/${created.body.data.id}`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ status: 'CANCELLED' })
      .expect(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    expect((await prisma.properties.findUniqueOrThrow({ where: { id: property.id } })).status).toBe('ACTIVE');
  });

  it('a different tenant cannot cancel someone else\'s request (403)', async () => {
    const owner = await userToken('Owner');
    const property = await createProperty(owner.userId);
    const t1 = await userToken('Tenant1');
    const t2 = await userToken('Tenant2');
    const created = await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${t1.token}`)
      .send(requestPayload(property.id))
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/rental-requests/${created.body.data.id}`)
      .set('Authorization', `Bearer ${t2.token}`)
      .send({ status: 'CANCELLED' })
      .expect(403);
  });
});

describe('reads', () => {
  it('GET /my lists the tenant\'s requests with derived endDate', async () => {
    const owner = await userToken('Owner');
    const property = await createProperty(owner.userId);
    const tenant = await userToken('Tenant');
    await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send(requestPayload(property.id, { durationMonths: 6 }))
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/rental-requests/my')
      .set('Authorization', `Bearer ${tenant.token}`)
      .expect(200);
    // Envelope: { success, data: { data: [...], meta } } — the list is nested.
    expect(res.body.data.data).toHaveLength(1);
    expect(res.body.data.data[0].propertyCard.id).toBe(property.id);
    expect(new Date(res.body.data.data[0].endDate).getTime()).toBeGreaterThan(Date.now());
    // Tenant view never exposes another tenant's identity.
    expect(res.body.data.data[0].tenantCard).toBeUndefined();
  });

  it('GET /owner/rental-requests lists with the tenant card', async () => {
    const owner = await userToken('Owner');
    const property = await createProperty(owner.userId);
    const tenant = await userToken('Tenant');
    await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send(requestPayload(property.id))
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/owner/rental-requests?status=PENDING')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(res.body.data.data).toHaveLength(1);
    expect(res.body.data.data[0].tenantCard.name).toBe('Tenant');
  });

  it('cross-tenant read is 403', async () => {
    const owner = await userToken('Owner');
    const property = await createProperty(owner.userId);
    const t1 = await userToken('Tenant1');
    const t2 = await userToken('Tenant2');
    const created = await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${t1.token}`)
      .send(requestPayload(property.id))
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/rental-requests/${created.body.data.id}`)
      .set('Authorization', `Bearer ${t2.token}`)
      .expect(403);
  });
});

describe('lifecycle jobs (direct invocation)', () => {
  it('completeExpiredRentals: past-end ACCEPTED → COMPLETED, property back to ACTIVE; idempotent re-run', async () => {
    const owner = await userToken('Owner');
    const property = await createProperty(owner.userId);
    const tenant = await userToken('Tenant');
    const day = 24 * 60 * 60 * 1000;
    const created = await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send(requestPayload(property.id))
      .expect(201);
    await prisma.rentalRequests.update({
      where: { id: created.body.data.id },
      data: { status: 'ACCEPTED' },
    });
    await prisma.properties.update({ where: { id: property.id }, data: { status: 'RENTED' } });

    const svc = app.get((await import('../src/modules/rental-requests/rental-requests.service.js')).RentalRequestsService);
    // The create window only allows future starts — backdate the row to
    // simulate an old rental whose window has ended.
    await prisma.rentalRequests.update({
      where: { id: created.body.data.id },
      data: { startDate: new Date(Date.now() - 400 * day) },
    });
    const first = await svc.completeExpiredRentals(new Date());
    expect(first.completedIds).toHaveLength(1);
    expect(
      (await prisma.rentalRequests.findUniqueOrThrow({ where: { id: created.body.data.id } })).status,
    ).toBe('COMPLETED');
    expect((await prisma.properties.findUniqueOrThrow({ where: { id: property.id } })).status).toBe('ACTIVE');

    // Re-run is a no-op.
    const second = await svc.completeExpiredRentals(new Date());
    expect(second.completedIds).toHaveLength(0);
  });

  it('completeExpiredRentals: keeps property RENTED while another ACCEPTED rental still covers now', async () => {
    const owner = await userToken('Owner');
    const property = await createProperty(owner.userId);
    const t1 = await userToken('Tenant1');
    const t2 = await userToken('Tenant2');
    const day = 24 * 60 * 60 * 1000;
    // Old rental past its end; fresh one still active. The create window only
    // allows future starts — backdate the old row directly.
    const old = await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${t1.token}`)
      .send(requestPayload(property.id, { durationMonths: 12 }))
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${t2.token}`)
      .send(requestPayload(property.id, { durationMonths: 12 }))
      .expect(201);
    await prisma.rentalRequests.update({
      where: { id: old.body.data.id },
      data: { startDate: new Date(Date.now() - 400 * day) },
    });
    await prisma.rentalRequests.updateMany({ data: { status: 'ACCEPTED' } });
    await prisma.properties.update({ where: { id: property.id }, data: { status: 'RENTED' } });

    const svc = app.get((await import('../src/modules/rental-requests/rental-requests.service.js')).RentalRequestsService);
    const { completedIds } = await svc.completeExpiredRentals(new Date());
    expect(completedIds).toEqual([old.body.data.id]);
    expect((await prisma.properties.findUniqueOrThrow({ where: { id: property.id } })).status).toBe('RENTED');
  });

  it('expireStalePending: PENDING with startDate > 1 day past → EXPIRED; idempotent', async () => {
    const owner = await userToken('Owner');
    const property = await createProperty(owner.userId);
    const tenant = await userToken('Tenant');
    const day = 24 * 60 * 60 * 1000;
    // Create normally (future window), then backdate the row — the endpoint
    // itself can never receive a past startDate (Zod window).
    const stale = await request(app.getHttpServer())
      .post('/api/v1/rental-requests')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send(requestPayload(property.id))
      .expect(201);
    await prisma.rentalRequests.update({
      where: { id: stale.body.data.id },
      data: { startDate: new Date(Date.now() - 3 * day) },
    });

    const svc = app.get((await import('../src/modules/rental-requests/rental-requests.service.js')).RentalRequestsService);
    const first = await svc.expireStalePending(new Date());
    expect(first.expiredIds).toHaveLength(1);
    expect((await prisma.rentalRequests.findUniqueOrThrow({ where: { id: stale.body.data.id } })).status).toBe('EXPIRED');

    const second = await svc.expireStalePending(new Date());
    expect(second.expiredIds).toHaveLength(0);
  });
});

describe('GET /api/v1/jobs (admin)', () => {
  it('admin sees queue states; a regular owner gets 403', async () => {
    // Role lives in the JWT payload (jwt-auth.guard → RoleGuard), so promote
    // the user AFTER register/verify but BEFORE login.
    const phone = await uniquePhone();
    const password = 'paroltest12345';
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Promoted', phone, password })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-phone')
      .send({ phone, code: reg.body.data.otpDev, purpose: 'REGISTRATION' })
      .expect(200);
    await prisma.users.update({ where: { phone }, data: { role: 'ADMIN' } });
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ phone, password })
      .expect(200);
    const adminToken = adminLogin.body.data.accessToken;

    const res = await request(app.getHttpServer())
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Assert by name (not count) so Phase 6's daily-stats/notifications-cleanup
    // — and any future queue — can't spuriously break this spec.
    const queueNames = (res.body.data as Array<{ queue: string }>).map((q) => q.queue);
    for (const expected of [
      'fx-rates',
      'orphan-images',
      'complete-rentals',
      'expire-pending-requests',
      'daily-stats',
      'notifications-cleanup',
    ]) {
      expect(queueNames).toContain(expected);
    }

    const owner = await userToken('Owner');
    await request(app.getHttpServer())
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(403);
  });
});
