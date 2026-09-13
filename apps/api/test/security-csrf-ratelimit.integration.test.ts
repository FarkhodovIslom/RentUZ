import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { CSRF_COOKIE } from '@rentuz/contracts';

/**
 * Phase 8 security integration suite (8_Phase.md §1.3):
 * - CSRF token issuance (double-submit cookie)
 * - login rate limit (6th request in a minute → 429)
 * - tampered JWT → 401; wrong-audience JWT (socket ticket secret) → 401
 * - SQL injection in ?city= does not bypass filters
 * - public property serializer never leaks owner phone/email
 * Note: the BFF-level CSRF header comparison is a web concern — covered by
 * the curl-verified matrix in the walkthrough; here we assert the API side
 * (cookie issuing + shape + rotation).
 */

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5434/rentuz';

let app: INestApplication;
let prisma: PrismaClient;
let redis: Redis;

async function boot(): Promise<void> {
  const { AppModule } = await import('../src/app.module.js');
  const { NestFactory } = await import('@nestjs/core');
  const { StandardSchemaValidationPipe } = await import('@nestjs/common');
  const cookieParser = (await import('cookie-parser')).default;
  // This suite exercises the REAL throttle policies — the integration config
  // disables them globally for the other suites (0_Phase.md §1 trap 2).
  // The guard reads the env per-request, so it must stay disabled-for-none
  // for the whole file; vitest runs integration files in isolated workers,
  // so this never leaks into the other suites.
  process.env.DISABLE_THROTTLE = 'false';
  app = await NestFactory.create(AppModule, { logger: false });
  app.use(cookieParser());
  app.useGlobalPipes(new StandardSchemaValidationPipe({ transform: true }));
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready'] });
  await app.init();
}

beforeAll(async () => {
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });
  redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  await boot();
}, 30000);

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  await redis?.quit();
}, 30000);

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "refreshTokens", "phoneVerifications", "users" CASCADE',
  );
  await redis.flushdb();
});

const PASSWORD = 'paroltest12345';

function extractCookie(res: request.Response, name: string): string {
  const setCookie: string[] = res.headers['set-cookie'] ?? [];
  const entry = setCookie.find((c) => c.startsWith(`${name}=`));
  return entry ? entry.split(';')[0]!.split('=').slice(1).join('=') : '';
}

describe('CSRF token endpoint', () => {
  it('issues a matching cookie + JSON token pair', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/csrf').expect(200);
    const token = res.body.data.token as string;
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    const cookie = extractCookie(res, CSRF_COOKIE);
    expect(cookie).toBe(token);
  });

  it('rotates the token on each issue', async () => {
    const first = await request(app.getHttpServer()).get('/api/v1/csrf').expect(200);
    const second = await request(app.getHttpServer()).get('/api/v1/csrf').expect(200);
    expect(first.body.data.token).not.toBe(second.body.data.token);
  });
});

describe('login rate limit (§98)', () => {
  it('6th request within the window returns 429', async () => {
    const phone = '+998903330001';
    const server = app.getHttpServer();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(server)
        .post('/api/v1/auth/login')
        .send({ phone, password: 'wrong-password' });
      statuses.push(res.status);
    }
    // First five: 401 (bad credentials, not yet throttled); 6th: throttled.
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });
});

describe('JWT tamper resistance (§53)', () => {
  it('rejects a tampered signature with 401', async () => {
    // Register → grab a valid access token, corrupt the signature tail.
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Tamper Test', phone: '+998903330002', password: PASSWORD })
      .expect(201);
    const token = reg.body.data.accessToken as string;
    const [header, payload, signature] = token.split('.');
    const tampered = `${header}.${payload}.${signature!.slice(0, -4)}AAAA`;
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${tampered}`)
      .expect(401);
  });

  it('rejects a JWT signed with the wrong audience (socket ticket secret)', async () => {
    const { JwtService } = await import('@nestjs/jwt');
    const jwt = new JwtService({
      secret: process.env.SOCKET_TICKET_SECRET ?? 'phase0-dev-socket-secret',
    });
    const ticket = await jwt.signAsync({ sub: '00000000-0000-4000-8000-000000000000' });
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${ticket}`)
      .expect(401);
  });
});

describe('SQL injection resistance (§53)', () => {
  it('?city= OR 1=1 does not bypass the region filter or error out', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/search/properties')
      .query({ city: "' OR 1=1 --" });
    // Defense in depth: the typed zod contract rejects the non-UUID city
    // (400) before any SQL runs; even past it, the repository binds the value
    // as a parameter — it can only match-zero, never alter the query.
    expect([200, 400]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toHaveLength(0);
    } else {
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('public serializer privacy (§99)', () => {
  it('property details never include owner phone/email', async () => {
    // Fresh owner with a unique phone + email, one ACTIVE property.
    const ownerPhone = '+998903330003';
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Privacy Owner', phone: ownerPhone, password: PASSWORD })
      .expect(201);
    const accessToken = reg.body.data.accessToken as string;

    const locations = await request(app.getHttpServer())
      .get('/api/v1/public/locations')
      .expect(200);
    const regionId = (locations.body.data as Array<{ id: string; kind: string }>).find(
      (l) => l.kind === 'REGION',
    )!.id;

    const draft = await request(app.getHttpServer())
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    const propertyId = draft.body.data.id as string;

    await request(app.getHttpServer())
      .patch(`/api/v1/properties/${propertyId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Privacy integration listing',
        description: 'Privacy integration test description minimum twenty chars.',
        type: 'APARTMENT',
        price: 5_000_000,
        rooms: 2,
        bedrooms: 1,
        bathrooms: 1,
        area: 50,
        address: 'Privacy street 1',
        regionId,
        amenities: ['wifi'],
      })
      .expect(200);

    // AUTO_APPROVE_LISTINGS=true in the integration env → submit → ACTIVE.
    await request(app.getHttpServer())
      .post(`/api/v1/properties/${propertyId}/submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect((res) => {
        if (res.status !== 200 && res.status !== 201) {
          throw new Error(`submit failed: ${res.status} ${JSON.stringify(res.body)}`);
        }
      });

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/public/properties/${propertyId}`)
      .expect(200);
    const json = JSON.stringify(detail.body.data);
    expect(json).not.toContain(ownerPhone);
    expect(json).not.toContain('"email"');
    expect(json).not.toContain('"phone"');
    expect(detail.body.data.ownerCard).toBeTruthy();
    expect(detail.body.data.ownerCard.phone).toBeUndefined();
    expect(detail.body.data.ownerCard.email).toBeUndefined();
  });
});
