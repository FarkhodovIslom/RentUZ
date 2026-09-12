import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import Redis from 'ioredis';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Phase 3 integration suite — search, map, public details, view tracking,
 * favorites (3_Phase.md §3). Runs against the live docker stack
 * (PostGIS :5434, Redis :6379). Truncates properties/users between cases.
 */

const DB_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5434/rentuz?schema=public&search_path=public,extensions';

const TASHKENT_REGION_SLUG = 'tashkent-city';
const SAMARKAND_REGION_SLUG = 'samarkand';
const TASHKENT_CENTER = { lng: 69.2401, lat: 41.3111 };

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
    `TRUNCATE TABLE "refreshTokens", "phoneVerifications", "propertyViews", "favorites", "users" CASCADE;`,
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

async function userToken(name = 'Searcher'): Promise<{ token: string; userId: string }> {
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
  return { token: login.body.data.accessToken, userId: login.body.data.user.id };
}

interface FixtureOpts {
  title?: string;
  type?: 'APARTMENT' | 'HOUSE' | 'ROOM' | 'COMMERCIAL' | 'OFFICE';
  priceUzs?: number;
  currency?: 'UZS' | 'USD';
  rooms?: number;
  bedrooms?: number;
  bathrooms?: number;
  area?: string;
  floor?: number;
  furnished?: 'NONE' | 'PARTIAL' | 'FULL';
  petsAllowed?: boolean;
  isVerified?: boolean;
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'RENTED';
  regionSlug?: string;
  lng?: number;
  lat?: number;
  views?: number;
  createdAt?: Date;
}

async function createOwner(): Promise<string> {
  const user = await prisma.users.create({
    data: {
      name: 'Fixture Owner',
      phone: await uniquePhone(),
      passwordHash: 'x',
      isPhoneVerified: true,
      canListProperties: true,
    },
    select: { id: true },
  });
  return user.id;
}

async function createProperty(opts: FixtureOpts = {}): Promise<{ id: string; slug: string }> {
  const owner = await prisma.users.findFirstOrThrow({ where: { name: 'Fixture Owner' }, select: { id: true } });
  const region = opts.regionSlug
    ? await prisma.locations.findUniqueOrThrow({ where: { slug: opts.regionSlug } })
    : null;
  const created = await prisma.properties.create({
    data: {
      ownerId: owner.id,
      slug: `fixture-${randomBytes(6).toString('hex')}`,
      title: opts.title ?? 'Fixture property',
      description: 'Fixture description for integration tests.',
      type: opts.type ?? 'APARTMENT',
      price: String(opts.priceUzs ?? 1_000_000),
      currency: opts.currency ?? 'UZS',
      priceUzs: BigInt(opts.priceUzs ?? 1_000_000),
      period: 'month',
      rooms: opts.rooms ?? 2,
      bedrooms: opts.bedrooms ?? 1,
      bathrooms: opts.bathrooms ?? 1,
      area: opts.area ?? '60',
      floor: opts.floor ?? 3,
      furnished: opts.furnished ?? 'NONE',
      petsAllowed: opts.petsAllowed ?? false,
      address: 'Fixture address 1',
      regionId: region?.id ?? null,
      amenities: ['wifi'],
      status: opts.status ?? 'ACTIVE',
      isVerified: opts.isVerified ?? true,
      views: opts.views ?? 0,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
    select: { id: true, slug: true },
  });
  if (opts.lng !== undefined && opts.lat !== undefined) {
    await prisma.$executeRawUnsafe(`SET search_path TO public, extensions;`);
    await prisma.$executeRawUnsafe(
      `UPDATE "properties" SET "location" = ST_SetSRID(ST_MakePoint(${opts.lng}, ${opts.lat}), 4326)::geography, "lat" = ${opts.lat}, "lng" = ${opts.lng} WHERE "id" = '${created.id}'::uuid;`,
    );
  }
  return created;
}

async function sqlCount(where: string): Promise<number> {
  await prisma.$executeRawUnsafe(`SET search_path TO public, extensions;`);
  const rows = await prisma.$queryRawUnsafe<{ c: number }[]>(
    `SELECT count(*)::int AS c FROM "properties" WHERE ${where};`,
  );
  return rows[0]?.c ?? 0;
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

describe('GET /api/v1/search/properties — filters', () => {
  it('returns only ACTIVE properties and matches a direct SQL count', async () => {
    await createOwner();
    await createProperty({ title: 'A', priceUzs: 1_000_000 });
    await createProperty({ title: 'B', priceUzs: 2_000_000 });
    await createProperty({ title: 'Draft', status: 'DRAFT', priceUzs: 3_000_000 });
    await createProperty({ title: 'Paused', status: 'PAUSED', priceUzs: 4_000_000 });

    const res = await request(app.getHttpServer())
      .get('/api/v1/search/properties')
      .expect(200);
    expect(res.body.data.meta.total).toBe(2);
    const total = await sqlCount(`status = 'ACTIVE'`);
    expect(res.body.data.meta.total).toBe(total);
  });

  it('filters by type, maxPrice and rooms — independently and combined — vs SQL counts', async () => {
    await createOwner();
    await createProperty({ type: 'APARTMENT', priceUzs: 1_000_000, rooms: 1 });
    await createProperty({ type: 'APARTMENT', priceUzs: 5_000_000, rooms: 2 });
    await createProperty({ type: 'HOUSE', priceUzs: 2_000_000, rooms: 3 });
    await createProperty({ type: 'ROOM', priceUzs: 500_000, rooms: 1 });

    const byType = await request(app.getHttpServer())
      .get('/api/v1/search/properties?type=HOUSE')
      .expect(200);
    expect(byType.body.data.meta.total).toBe(1);
    expect(byType.body.data.data[0].type).toBe('HOUSE');

    const byPrice = await request(app.getHttpServer())
      .get('/api/v1/search/properties?maxPrice=2000000')
      .expect(200);
    const sqlTotal = await sqlCount(`status = 'ACTIVE' AND "priceUzs" <= 2000000`);
    expect(byPrice.body.data.meta.total).toBe(sqlTotal);
    expect(byPrice.body.data.meta.total).toBe(3);

    const byRooms = await request(app.getHttpServer())
      .get('/api/v1/search/properties?rooms=2')
      .expect(200);
    expect(byRooms.body.data.meta.total).toBe(2);

    const combined = await request(app.getHttpServer())
      .get('/api/v1/search/properties?type=APARTMENT&maxPrice=4000000&rooms=1')
      .expect(200);
    const sqlCombined = await sqlCount(
      `status = 'ACTIVE' AND "priceUzs" <= 4000000 AND rooms >= 1 AND type = 'APARTMENT'`,
    );
    expect(combined.body.data.meta.total).toBe(sqlCombined);
    expect(combined.body.data.meta.total).toBe(1);
  });

  it('filters by region, furnished, pets, and verified flags', async () => {
    await createOwner();
    await createProperty({ regionSlug: TASHKENT_REGION_SLUG, furnished: 'FULL', petsAllowed: true });
    await createProperty({ regionSlug: SAMARKAND_REGION_SLUG, furnished: 'NONE', petsAllowed: false, isVerified: false });

    const region = await prisma.locations.findUniqueOrThrow({ where: { slug: TASHKENT_REGION_SLUG } });
    const byCity = await request(app.getHttpServer())
      .get(`/api/v1/search/properties?city=${region.id}`)
      .expect(200);
    expect(byCity.body.data.meta.total).toBe(1);
    expect(byCity.body.data.data[0].regionName).toBe(region.name);

    const byFurnished = await request(app.getHttpServer())
      .get('/api/v1/search/properties?furnished=FULL')
      .expect(200);
    expect(byFurnished.body.data.meta.total).toBe(1);

    const byPets = await request(app.getHttpServer())
      .get('/api/v1/search/properties?pets=true')
      .expect(200);
    expect(byPets.body.data.meta.total).toBe(1);

    const byVerified = await request(app.getHttpServer())
      .get('/api/v1/search/properties?verified=true')
      .expect(200);
    expect(byVerified.body.data.meta.total).toBe(1);
  });

  it('rejects invalid filter values with 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/search/properties?type=CASTLE')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/search/properties?radius=10')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/search/properties?limit=101')
      .expect(400);
  });

  it('sorts by price_asc, price_desc, popular and newest', async () => {
    await createOwner();
    const c = new Date();
    const a = await createProperty({ title: 'Price A', priceUzs: 3_000_000, views: 10, createdAt: new Date(c.getTime() - 3000) });
    const b = await createProperty({ title: 'Price B', priceUzs: 1_000_000, views: 30, createdAt: new Date(c.getTime() - 2000) });
    const d = await createProperty({ title: 'Price C', priceUzs: 2_000_000, views: 20, createdAt: new Date(c.getTime() - 1000) });

    const asc = await request(app.getHttpServer()).get('/api/v1/search/properties?sort=price_asc&limit=10').expect(200);
    expect(asc.body.data.data.map((p: { id: string }) => p.id)).toEqual([b.id, d.id, a.id]);

    const desc = await request(app.getHttpServer()).get('/api/v1/search/properties?sort=price_desc&limit=10').expect(200);
    expect(desc.body.data.data.map((p: { id: string }) => p.id)).toEqual([a.id, d.id, b.id]);

    const popular = await request(app.getHttpServer()).get('/api/v1/search/properties?sort=popular&limit=10').expect(200);
    expect(popular.body.data.data.map((p: { id: string }) => p.id)).toEqual([b.id, d.id, a.id]);

    const newest = await request(app.getHttpServer()).get('/api/v1/search/properties?sort=newest&limit=10').expect(200);
    expect(newest.body.data.data.map((p: { id: string }) => p.id)).toEqual([d.id, b.id, a.id]);
  });

  it('paginates with meta and keeps the true total on out-of-range pages', async () => {
    await createOwner();
    for (let i = 0; i < 5; i++) {
      await createProperty({ title: `P${i}`, priceUzs: 1_000_000 + i });
    }
    const page1 = await request(app.getHttpServer()).get('/api/v1/search/properties?limit=2&page=1').expect(200);
    expect(page1.body.data.data).toHaveLength(2);
    expect(page1.body.data.meta).toMatchObject({ page: 1, limit: 2, total: 5, totalPages: 3 });

    const page3 = await request(app.getHttpServer()).get('/api/v1/search/properties?limit=2&page=3').expect(200);
    expect(page3.body.data.data).toHaveLength(1);

    const page9 = await request(app.getHttpServer()).get('/api/v1/search/properties?limit=2&page=9').expect(200);
    expect(page9.body.data.data).toHaveLength(0);
    expect(page9.body.data.meta.total).toBe(5);
  });
});

describe('GET /api/v1/search/properties — geo radius', () => {
  it('returns only properties within the radius, matching ST_DWithin', async () => {
    await createOwner();
    // ~1 km from center
    await createProperty({ title: 'Near', lng: TASHKENT_CENTER.lng + 0.01, lat: TASHKENT_CENTER.lat });
    // ~10+ km from center
    await createProperty({ title: 'Far', lng: TASHKENT_CENTER.lng + 0.15, lat: TASHKENT_CENTER.lat });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/search/properties?lat=${TASHKENT_CENTER.lat}&lng=${TASHKENT_CENTER.lng}&radius=3000`)
      .expect(200);

    const sqlTotal = await sqlCount(
      `status = 'ACTIVE' AND ST_DWithin("location", ST_SetSRID(ST_MakePoint(${TASHKENT_CENTER.lng}, ${TASHKENT_CENTER.lat}), 4326)::geography, 3000)`,
    );
    expect(res.body.data.meta.total).toBe(sqlTotal);
    expect(res.body.data.meta.total).toBe(1);
    expect(res.body.data.data[0].title).toBe('Near');
  });
});

describe('GET /api/v1/search/map', () => {
  it('returns lean markers inside the bbox only', async () => {
    await createOwner();
    const inBox = await createProperty({ title: 'In', lng: 69.25, lat: 41.31, priceUzs: 1_000_000 });
    await createProperty({ title: 'Out', lng: 65.0, lat: 39.0, priceUzs: 2_000_000 });

    const res = await request(app.getHttpServer())
      .get('/api/v1/search/map?swLng=69.2&swLat=41.28&neLng=69.3&neLat=41.34')
      .expect(200);

    expect(res.body.data.markers).toHaveLength(1);
    const marker = res.body.data.markers[0] as Record<string, unknown>;
    expect(marker.id).toBe(inBox.id);
    // Lean payload per §93 — no heavy fields.
    expect(Object.keys(marker).sort()).toEqual(
      ['currency', 'id', 'lat', 'lng', 'mainImage', 'price', 'priceUzs', 'slug', 'title', 'type'].sort(),
    );
    expect(res.body.data.truncated).toBe(false);
  });

  it('caps at 500 markers and reports truncation', async () => {
    await createOwner();
    const owner = await prisma.users.findFirstOrThrow({ where: { name: 'Fixture Owner' } });
    const rows = Array.from({ length: 505 }, (_, i) => ({
      ownerId: owner.id,
      slug: `bulk-${i}-${randomBytes(4).toString('hex')}`,
      title: `Bulk ${i}`,
      description: 'bulk',
      type: 'APARTMENT' as const,
      price: '1000000.00',
      currency: 'UZS' as const,
      priceUzs: BigInt(1_000_000),
      period: 'month',
      rooms: 1,
      bedrooms: 1,
      bathrooms: 1,
      area: '50.00',
      address: 'bulk',
      amenities: [],
      status: 'ACTIVE' as const,
      isVerified: true,
    }));
    await prisma.properties.createMany({ data: rows });
    await prisma.$executeRawUnsafe(`SET search_path TO public, extensions;`);
    await prisma.$executeRawUnsafe(
      `UPDATE "properties" SET "location" = ST_SetSRID(ST_MakePoint(69.25, 41.31), 4326)::geography, "lat" = 41.31, "lng" = 69.25 WHERE "slug" LIKE 'bulk-%';`,
    );

    const res = await request(app.getHttpServer())
      .get('/api/v1/search/map?swLng=69.2&swLat=41.28&neLng=69.3&neLat=41.34')
      .expect(200);
    expect(res.body.data.markers).toHaveLength(500);
    expect(res.body.data.truncated).toBe(true);
  });
});

describe('search cache (Redis)', () => {
  it('serves identical responses within TTL and invalidates on version bump', async () => {
    await createOwner();
    const p = await createProperty({ title: 'Cache me', priceUzs: 1_234_567 });

    const first = await request(app.getHttpServer()).get('/api/v1/search/properties?limit=10').expect(200);
    expect(first.body.data.meta.total).toBe(1);

    // Mutate the row behind the API's back — a cached response must not see it.
    await prisma.properties.update({ where: { id: p.id }, data: { title: 'Mutated title' } });

    const cached = await request(app.getHttpServer()).get('/api/v1/search/properties?limit=10').expect(200);
    expect(cached.body.data.data[0].title).toBe('Cache me');

    // Lifecycle transition bumps the version → next read is fresh.
    await redis.incr('search:cache:ver');
    const fresh = await request(app.getHttpServer()).get('/api/v1/search/properties?limit=10').expect(200);
    expect(fresh.body.data.data[0].title).toBe('Mutated title');
  });

  it('submitting a property through the API bumps the cache version', async () => {
    const { token } = await userToken('Submitter');
    const create = await request(app.getHttpServer())
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    const propertyId = create.body.data.id as string;
    const region = await prisma.locations.findUniqueOrThrow({ where: { slug: TASHKENT_REGION_SLUG } });

    const before = Number((await redis.get('search:cache:ver')) ?? 0);
    await request(app.getHttpServer())
      .patch(`/api/v1/properties/${propertyId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Cache invalidation property',
        description: 'A property long enough to pass validation comfortably.',
        type: 'APARTMENT',
        price: 2_000_000,
        currency: 'UZS',
        rooms: 2,
        bedrooms: 1,
        bathrooms: 1,
        area: 55,
        address: 'Somewhere 12',
        regionId: region.id,
        amenities: ['wifi'],
      })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/properties/${propertyId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const after = Number((await redis.get('search:cache:ver')) ?? 0);
    expect(after).toBeGreaterThan(before);
  });
});

describe('GET /api/v1/public/properties/:slugOrId — details + views', () => {
  it('returns full public details without owner-sensitive fields, by slug and by uuid', async () => {
    await createOwner();
    const p = await createProperty({ title: 'Details target', priceUzs: 2_500_000, regionSlug: TASHKENT_REGION_SLUG, lng: 69.24, lat: 41.31 });

    const bySlug = await request(app.getHttpServer()).get(`/api/v1/public/properties/${p.slug}`).expect(200);
    const detail = bySlug.body.data;
    expect(detail.id).toBe(p.id);
    expect(detail.title).toBe('Details target');
    expect(detail.ownerCard).toMatchObject({ name: 'Fixture Owner', isPhoneVerified: true });
    expect(detail.ownerCard).not.toHaveProperty('email');
    expect(detail.ownerCard).not.toHaveProperty('phone');
    expect(detail.similar).toEqual([]);
    // Field-level scrub: no raw phone numbers anywhere in the payload.
    expect(JSON.stringify(bySlug.body)).not.toContain('+998');

    const byId = await request(app.getHttpServer()).get(`/api/v1/public/properties/${p.id}`).expect(200);
    expect(byId.body.data.id).toBe(p.id);
  });

  it('sets Cache-Control for edge caching', async () => {
    await createOwner();
    const p = await createProperty({});
    const res = await request(app.getHttpServer()).get(`/api/v1/public/properties/${p.slug}`).expect(200);
    expect(res.headers['cache-control']).toContain('s-maxage=60');
  });

  it('increments views exactly once per (property, session, day) and skips the owner', async () => {
    await createOwner();
    const p = await createProperty({});

    // Anonymous first hit — the API sets rz_sid.
    const first = await request(app.getHttpServer()).get(`/api/v1/public/properties/${p.slug}`).expect(200);
    const sidCookie = first.headers['set-cookie']?.find((c) => c.startsWith('rz_sid='));
    expect(sidCookie).toBeDefined();

    // Second hit with the same session cookie — dedup, counter stays 1.
    const sid = (sidCookie as string).split(';')[0];
    await request(app.getHttpServer()).get(`/api/v1/public/properties/${p.slug}`).set('Cookie', sid).expect(200);

    // A different session counts again.
    await request(app.getHttpServer())
      .get(`/api/v1/public/properties/${p.slug}`)
      .set('Cookie', 'rz_sid=11111111-1111-4111-8111-111111111111')
      .expect(200);

    let row = await prisma.properties.findUniqueOrThrow({ where: { id: p.id }, select: { views: true } });
    expect(row.views).toBe(2);
    const viewRows = await prisma.propertyViews.count({ where: { propertyId: p.id } });
    expect(viewRows).toBe(2);

    // The owner's own view never counts (auth via cookie).
    const { token } = await userToken('Owner Viewer');
    await prisma.properties.update({ where: { id: p.id }, data: { ownerId: (await currentUser(token)).id } });
    await request(app.getHttpServer())
      .get(`/api/v1/public/properties/${p.slug}`)
      .set('Cookie', `rentuz_at=${token}`)
      .expect(200);
    row = await prisma.properties.findUniqueOrThrow({ where: { id: p.id }, select: { views: true } });
    expect(row.views).toBe(2); // unchanged
  });

  it('returns similar properties from the same region+type', async () => {
    await createOwner();
    const target = await createProperty({ title: 'Target', regionSlug: TASHKENT_REGION_SLUG, type: 'APARTMENT' });
    await createProperty({ title: 'Twin', regionSlug: TASHKENT_REGION_SLUG, type: 'APARTMENT' });
    await createProperty({ title: 'Other type', regionSlug: TASHKENT_REGION_SLUG, type: 'HOUSE' });
    await createProperty({ title: 'Other region', regionSlug: SAMARKAND_REGION_SLUG, type: 'APARTMENT' });

    const res = await request(app.getHttpServer()).get(`/api/v1/search/featured`);
    expect(res.status).toBe(200); // featured endpoint sanity

    const similar = await request(app.getHttpServer())
      .get(`/api/v1/public/properties/${target.slug}/similar`)
      .expect(200);
    expect(similar.body.data).toHaveLength(1);
    expect(similar.body.data[0].title).toBe('Twin');
  });

  it('404s for non-ACTIVE or missing properties', async () => {
    await createOwner();
    const draft = await createProperty({ status: 'DRAFT' });
    await request(app.getHttpServer()).get(`/api/v1/public/properties/${draft.slug}`).expect(404);
    await request(app.getHttpServer()).get('/api/v1/public/properties/no-such-slug').expect(404);
  });
});

describe('favorites', () => {
  it('adds idempotently, lists with filters, and removes', async () => {
    await createOwner();
    const p = await createProperty({ title: 'Fav target', priceUzs: 3_000_000 });
    const { token } = await userToken('Favoriter');

    await request(app.getHttpServer())
      .post(`/api/v1/favorites/${p.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    // Duplicate POST is idempotent.
    await request(app.getHttpServer())
      .post(`/api/v1/favorites/${p.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/api/v1/favorites')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.data.data).toHaveLength(1);
    expect(list.body.data.data[0].id).toBe(p.id);
    expect(list.body.data.meta.total).toBe(1);

    // Filters apply to the favorites list too.
    const filtered = await request(app.getHttpServer())
      .get('/api/v1/favorites?maxPrice=1000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(filtered.body.data.meta.total).toBe(0);

    await request(app.getHttpServer())
      .delete(`/api/v1/favorites/${p.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const after = await request(app.getHttpServer())
      .get('/api/v1/favorites')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body.data.meta.total).toBe(0);
  });

  it('404s on non-ACTIVE properties, own properties, and requires auth', async () => {
    await createOwner();
    const draft = await createProperty({ status: 'DRAFT' });
    const { token, userId } = await userToken('Self Favoriter');
    // Make the property owned by the requester.
    await prisma.properties.update({ where: { id: draft.id }, data: { ownerId: userId, status: 'ACTIVE' } });

    await request(app.getHttpServer())
      .post(`/api/v1/favorites/${draft.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404); // own property

    const other = await createProperty({ status: 'PAUSED' });
    await request(app.getHttpServer())
      .post(`/api/v1/favorites/${other.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404); // not ACTIVE

    await request(app.getHttpServer()).get('/api/v1/favorites').expect(401);
    await request(app.getHttpServer()).post(`/api/v1/favorites/${other.id}`).expect(401);
  });
});

describe('GET /api/v1/search/cities + /search/featured', () => {
  it('cities returns regions with ACTIVE counts', async () => {
    await createOwner();
    await createProperty({ regionSlug: TASHKENT_REGION_SLUG });
    await createProperty({ regionSlug: TASHKENT_REGION_SLUG, status: 'PAUSED' });
    await createProperty({ regionSlug: SAMARKAND_REGION_SLUG });

    const res = await request(app.getHttpServer()).get('/api/v1/search/cities').expect(200);
    const toshkent = res.body.data.find((c: { slug: string }) => c.slug === TASHKENT_REGION_SLUG);
    const samarkand = res.body.data.find((c: { slug: string }) => c.slug === 'samarkand');
    expect(toshkent?.count).toBe(1);
    expect(samarkand?.count).toBe(1);
    expect(res.body.data.length).toBe(2);
  });

  it('featured returns ACTIVE cards (view-backed, with views fallback)', async () => {
    await createOwner();
    const hot = await createProperty({ title: 'Hot', views: 50 });
    await createProperty({ title: 'Cold', views: 1 });

    const res = await request(app.getHttpServer()).get('/api/v1/search/featured').expect(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data[0].id).toBe(hot.id);
  });
});

async function currentUser(token: string): Promise<{ id: string }> {
  const res = await request(app.getHttpServer())
    .get('/api/v1/users/me')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  return res.body.data;
}
