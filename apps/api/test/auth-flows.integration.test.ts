import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Auth integration suite — runs against the live docker stack
 * (PostGIS :5434, Redis :6379; see context/1_Phase.md §4 Tests).
 * Truncates auth-related tables before each case.
 */

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5434/rentuz';

let app: INestApplication;
let prisma: PrismaClient;
let redis: Redis;

async function truncate(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "refreshTokens", "phoneVerifications", "users" CASCADE',
  );
  await redis.flushdb();
}

async function boot(): Promise<void> {
  const { AppModule } = await import('../src/app.module.js');
  const { NestFactory } = await import('@nestjs/core');
  const { StandardSchemaValidationPipe } = await import('@nestjs/common');
  const cookieParser = (await import('cookie-parser')).default;
  app = await NestFactory.create(AppModule, { logger: false });
  // Mirror main.ts setup (minus swagger — not needed for these tests).
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
  await truncate();
});

const PASSWORD = 'paroltest12345';

describe('POST /api/v1/auth/register', () => {
  it('creates a USER, issues tokens + dev OTP, sets cookies', async () => {
    const phone = '+998901110001';
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Integration Test', phone, password: PASSWORD })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user.phone).toBe(phone);
    expect(res.body.data.user.role).toBe('USER');
    expect(res.body.data.user.isPhoneVerified).toBe(false);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.data.otpDev).toMatch(/^\d{5}$/); // AUTH_OTP_DEV_MODE
    expect(res.headers['set-cookie']).toBeDefined();

    const stored = await prisma.users.findUnique({ where: { phone } });
    expect(stored).not.toBeNull();
    expect(stored!.passwordHash).not.toContain(PASSWORD);
  });

  it('rejects a duplicate phone with CONFLICT', async () => {
    const body = { name: 'Dup', phone: '+998901110002', password: PASSWORD };
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(body).expect(201);
    const res = await request(app.getHttpServer()).post('/api/v1/auth/register').send(body).expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects an invalid phone (Zod via Standard Schema)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Bad Phone', phone: '12345', password: PASSWORD })
      .expect(400);
  });
});

describe('POST /api/v1/auth/verify-phone', () => {
  it('verifies the code, unlocks canListProperties, reissues tokens', async () => {
    const phone = '+998901110003';
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Verify Me', phone, password: PASSWORD })
      .expect(201);
    const code = reg.body.data.otpDev;

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-phone')
      .send({ phone, code, purpose: 'REGISTRATION' })
      .expect(200);

    expect(res.body.data.user.isPhoneVerified).toBe(true);
    expect(res.body.data.user.canListProperties).toBe(true);

    const stored = await prisma.users.findUnique({ where: { phone } });
    expect(stored!.isPhoneVerified).toBe(true);
  });

  it('rejects a wrong code and counts attempts', async () => {
    const phone = '+998901110004';
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Wrong Code', phone, password: PASSWORD })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-phone')
      .send({ phone, code: '99999', purpose: 'REGISTRATION' })
      .expect(401);

    const otp = await prisma.phoneVerifications.findFirst({ where: { phone }, orderBy: { createdAt: 'desc' } });
    expect(otp!.attempts).toBe(1);
  });
});

describe('POST /api/v1/auth/login + refresh rotation', () => {
  it('logs in, rotates refresh, detects reuse, revokes family', async () => {
    const phone = '+998901110005';
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Rotate', phone, password: PASSWORD })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-phone')
      .send({ phone, code: reg.body.data.otpDev, purpose: 'REGISTRATION' })
      .expect(200);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ phone, password: PASSWORD })
      .expect(200);
    const firstRefresh = login.body.data.refreshToken;

    // Rotate — new token, same family.
    const rotated = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `rentuz_rt=${firstRefresh}`)
      .expect(200);
    expect(rotated.body.data.refreshToken).not.toBe(firstRefresh);

    // REUSE the rotated-away token → whole family revoked.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `rentuz_rt=${firstRefresh}`)
      .expect(401);

    // The rotated token must ALSO be dead now (family revoke).
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `rentuz_rt=${rotated.body.data.refreshToken}`)
      .expect(401);
  });

  it('locks the account after 10 failed logins (Redis counter)', async () => {
    const phone = '+998901110006';
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Lockout', phone, password: PASSWORD })
      .expect(201);

    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ phone, password: 'wrong-password-123' })
        .expect(401);
    }

    // 11th attempt — even with the CORRECT password — is locked (429).
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ phone, password: PASSWORD })
      .expect(429);
  });
});

describe('GET /api/v1/users/me + RBAC', () => {
  it('returns the current user without passwordHash', async () => {
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Me', phone: '+998901110007', password: PASSWORD })
      .expect(201);
    const token = reg.body.data.accessToken;

    const res = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.id).toBeTruthy();
    expect(res.body.data).not.toHaveProperty('passwordHash');
  });

  it('401 for anonymous /users/me', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('refresh-token cookie also authenticates (BFF path)', async () => {
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Cookie', phone: '+998901110008', password: PASSWORD })
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Cookie', `rentuz_at=${reg.body.data.accessToken}`)
      .expect(200);
  });
});

describe('POST /api/v1/auth/reset-password', () => {
  it('resets the password and revokes all refresh tokens', async () => {
    const phone = '+998901110009';
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Reset', phone, password: PASSWORD })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-phone')
      .send({ phone, code: reg.body.data.otpDev, purpose: 'REGISTRATION' })
      .expect(200);

    // Old password works.
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ phone, password: PASSWORD })
      .expect(200);

    const forgot = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ phone })
      .expect(200);
    expect(forgot.body.data.otpDev).toMatch(/^\d{5}$/);

    const newPassword = 'yangi-parol-12345';
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ phone, code: forgot.body.data.otpDev, newPassword })
      .expect(200);

    // reset-password must have revoked ALL pre-existing refresh tokens — and
    // issued exactly one fresh one (reset logs the user in per §39 behavior).
    const afterReset = await prisma.refreshTokens.count({
      where: { user: { phone }, revokedAt: null },
    });
    expect(afterReset).toBe(1);

    // ...old password now fails, new one works (and issues a fresh token).
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ phone, password: PASSWORD })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ phone, password: newPassword })
      .expect(200);

    const live = await prisma.refreshTokens.count({ where: { user: { phone }, revokedAt: null } });
    expect(live).toBe(2); // reset token + post-reset login token
  });
});
