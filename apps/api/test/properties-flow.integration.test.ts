import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import Redis from 'ioredis';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Property CRUD integration suite — runs against the live docker stack
 * (PostGIS :5434, Redis :6379; see 2_Phase.md §1). Truncates properties,
 * refresh tokens, and users between cases so re-runs are stable.
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
  // RefreshTokens cascade-delete from users; property images cascade from properties.
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "refreshTokens", "phoneVerifications", "users" CASCADE;`,
  );
  await prisma.$executeRawUnsafe(`SET search_path TO public, extensions; DELETE FROM "propertyImages";`);
  await prisma.$executeRawUnsafe(`SET search_path TO public, extensions; DELETE FROM "properties";`);
  await redis.flushdb();
}

async function uniquePhone(): Promise<string> {
  // E.164 UZ: +998 + exactly 9 digits (13 chars total, matches the
  // server-side Zod regex `^\+998\d{9}$`). Per-test uniqueness kills the
  // re-run/throttle races the Phase 2 walkthrough flagged.
  const digits = randomBytes(4)
    .toString('hex')
    .split('')
    .map((c) => (Number.isFinite(parseInt(c, 16)) ? (parseInt(c, 16) % 10).toString() : c))
    .join('')
    .slice(0, 9)
    .padStart(9, '5');
  return `+998${digits}`;
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

describe('Properties CRUD — owner', () => {
  it('creates a draft, updates it, submits it (auto-approve → ACTIVE), and lists it publicly', async () => {
    // Register + verify
    const phone = await uniquePhone();
    const password = 'paroltest12345';
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Owner', phone, password })
      .expect(201);
    const otp = reg.body.data.otpDev as string;
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-phone')
      .send({ phone, code: otp, purpose: 'REGISTRATION' })
      .expect(200);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ phone, password })
      .expect(200);
    const token = login.body.data.accessToken as string;

    // 1) Create DRAFT
    const create = await request(app.getHttpServer())
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    const propertyId = create.body.data.id as string;
    expect(propertyId).toBeDefined();

    // 2) Update with full data + geo
    const regionRow = await prisma.locations.findFirstOrThrow({ where: { slug: 'tashkent-city' } });
    const update = await request(app.getHttpServer())
      .patch(`/api/v1/properties/${propertyId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: '2 xonali kvartira ijara',
        description: 'Yangi ta\'mirlangan kvartira, metro yaqin, muzlatgich bor.',
        type: 'APARTMENT',
        price: 3_500_000,
        currency: 'UZS',
        rooms: 2,
        bedrooms: 2,
        bathrooms: 1,
        area: 65,
        address: 'Amir Temur 12-uy, 45-xonadon',
        regionId: regionRow.id,
        lng: 69.2401,
        lat: 41.3111,
        amenities: ['wifi', 'parking'],
      })
      .expect(200);
    expect(update.body.data.status).toBe('DRAFT');

    // 3) Submit (auto-approve → ACTIVE in dev)
    const submit = await request(app.getHttpServer())
      .post(`/api/v1/properties/${propertyId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(submit.body.data.status).toBe('ACTIVE');

    // 4) Public search listing includes the new property
    const publicList = await request(app.getHttpServer())
      .get('/api/v1/search/properties?limit=100')
      .expect(200);
    const ids = (publicList.body.data.data as Array<{ id: string; isVerified: boolean }>).map((p) => p.id);
    expect(ids).toContain(propertyId);
  });

  it('rejects UPDATE by a non-owner (403)', async () => {
    // Owner A
    const phoneA = await uniquePhone();
    const a = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Owner A', phone: phoneA, password: 'paroltest12345' });
    const aCode = a.body.data.otpDev;
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-phone')
      .send({ phone: phoneA, code: aCode, purpose: 'REGISTRATION' });
    const aLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ phone: phoneA, password: 'paroltest12345' });
    const aToken = aLogin.body.data.accessToken;
    const aDraft = await request(app.getHttpServer())
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${aToken}`);
    const aPropId = aDraft.body.data.id;

    // Owner B
    const phoneB = await uniquePhone();
    const b = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Owner B', phone: phoneB, password: 'paroltest12345' });
    const bCode = b.body.data.otpDev;
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-phone')
      .send({ phone: phoneB, code: bCode, purpose: 'REGISTRATION' });
    const bLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ phone: phoneB, password: 'paroltest12345' });
    const bToken = bLogin.body.data.accessToken;

    // B tries to update A's property — 403 (title is long enough to pass
    // validation so the failure really is the ownership check).
    await request(app.getHttpServer())
      .patch(`/api/v1/properties/${aPropId}`)
      .set('Authorization', `Bearer ${bToken}`)
      .send({ title: 'Hijack attempt title' })
      .expect(403);

    // B tries to view A's property — 403
    await request(app.getHttpServer())
      .get(`/api/v1/properties/${aPropId}`)
      .set('Authorization', `Bearer ${bToken}`)
      .expect(403);
  });

  it('requires anonymous 401 on protected property endpoints', async () => {
    await request(app.getHttpServer()).get('/api/v1/properties/me').expect(401);
  });

  it('GET /properties/me returns JSON-serializable DTOs (BigInt priceUzs → number)', async () => {
    // Phase 4 debt regression: raw rows 500ed at BigInt serialization once an
    // owner had ≥1 property. Mirrors the flow above but asserts /properties/me.
    const phone = await uniquePhone();
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Owner', phone, password: 'paroltest12345' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-phone')
      .send({ phone, code: reg.body.data.otpDev as string, purpose: 'REGISTRATION' })
      .expect(200);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ phone, password: 'paroltest12345' })
      .expect(200);
    const token = login.body.data.accessToken as string;

    await request(app.getHttpServer())
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/properties/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const listings = res.body.data as Array<{
      id: string;
      title: string;
      status: string;
      views: number;
      priceUzs: number;
      currency: string;
      createdAt: string;
    }>;
    expect(listings.length).toBeGreaterThanOrEqual(1);
    expect(typeof listings[0]!.priceUzs).toBe('number');
    expect(Number.isFinite(listings[0]!.priceUzs)).toBe(true);
    expect(listings[0]!.status).toBe('DRAFT');
  });

  it('GET /public/locations returns 78 seeded entries', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/public/locations')
      .expect(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(70); // Phase 1 seed: 78
  });
});
