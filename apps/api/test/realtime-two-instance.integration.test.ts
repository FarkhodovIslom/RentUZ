import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import Redis from 'ioredis';
import { io as ioc, type Socket } from 'socket.io-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Phase 5 §4 DoD — two API instances behind one Redis with
 * RENTUZ_REALTIME_SCALE=2: a message sent through instance 1's HTTP surface
 * is delivered to a socket connected to instance 2 (Redis adapter pub/sub).
 */

const DB_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5434/rentuz?schema=public&search_path=public,extensions';

process.env.RENTUZ_REALTIME_SCALE = '2';
process.env.PRESENCE_GRACE_MS ??= '2000';
process.env.DISABLE_JOBS = 'true';
process.env.DISABLE_THROTTLE = 'true';

let app1: INestApplication;
let app2: INestApplication;
let port1 = 0;
let port2 = 0;
let prisma: PrismaClient;
let redis: Redis;

async function boot(): Promise<void> {
  const { AppModule } = await import('../src/app.module.js');
  const { NestFactory } = await import('@nestjs/core');
  const { StandardSchemaValidationPipe } = await import('@nestjs/common');
  const cookieParser = (await import('cookie-parser')).default;
  const { RedisIoAdapter } = await import('../src/modules/realtime/redis-io.adapter.js');

  for (const which of [1, 2] as const) {
    const app = await NestFactory.create(AppModule, { logger: false });
    app.use(cookieParser());
    app.useGlobalPipes(new StandardSchemaValidationPipe({ transform: true }));
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready'] });
    app.useWebSocketAdapter(new RedisIoAdapter(app));
    await app.init();
    const server = app.getHttpServer() as { listen: (port: number, cb: () => void) => void };
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    if (which === 1) {
      app1 = app;
      port1 = port;
    } else {
      app2 = app;
      port2 = port;
    }
  }
}

async function truncate(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "messages", "conversationParticipants", "conversations", "notifications", "refreshTokens", "phoneVerifications", "propertyViews", "favorites", "rentalRequests", "users" CASCADE;`,
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

async function userToken(app: INestApplication, name = 'User'): Promise<{ token: string; userId: string }> {
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

async function createProperty(ownerId: string): Promise<{ id: string }> {
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
      status: 'ACTIVE',
      isVerified: true,
      views: 0,
    },
    select: { id: true },
  });
}

async function ticketFrom(app: INestApplication, token: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/realtime/ticket')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  return res.body.data.ticket as string;
}

function connectTo(port: number, ticket: string): Socket {
  return ioc(`http://localhost:${port}`, {
    transports: ['websocket'],
    auth: { ticket },
    extraHeaders: { Origin: 'http://localhost:3000' },
    reconnection: false,
    timeout: 5000,
  });
}

/** The response-envelope interceptor wraps WS acks: { success, data, message }. */
function ackData<T>(ack: unknown): T {
  const wrapped = ack as { data?: T };
  return (wrapped?.data ?? (ack as T));
}

/** Wait for the gateway 'ready' signal — 'connect' fires before handleConnection's async work lands. */
function waitReady(socket: Socket, timeoutMs = 5000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for ready')), timeoutMs);
    socket.once('ready', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function waitFor<T>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
    socket.once('connect_error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

beforeAll(async () => {
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });
  redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  await boot();
}, 30_000);

afterAll(async () => {
  // Force-close sockets on BOTH instances — HTTP close hangs on live WS
  // connections otherwise.
  try {
    const { RealtimeGateway } = await import('../src/modules/realtime/realtime.gateway.js');
    for (const instance of [app1, app2]) {
      instance?.get(RealtimeGateway).server?.disconnectSockets(true);
    }
  } catch {
    // Gateway already down — continue teardown.
  }
  await app1?.close();
  await app2?.close();
  await prisma?.$disconnect();
  await redis?.quit();
}, 30_000);

beforeEach(async () => {
  await truncate();
});

describe('Redis adapter — cross-instance realtime (5_Phase.md §4)', () => {
  it('a message sent via instance 1 is delivered to a socket on instance 2', async () => {
    // Tenant works through instance 1; the owner listens on instance 2.
    const owner = await userToken(app1, 'Owner');
    const tenant = await userToken(app1, 'Tenant');
    const property = await createProperty(owner.userId);

    const conv = await request(app1.getHttpServer())
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ propertyId: property.id })
      .expect(201);
    const conversationId = conv.body.data.id as string;

    const ownerSocket = connectTo(port2, await ticketFrom(app1, owner.token));
    await waitReady(ownerSocket);
    const joinAck = ackData<{ ok: boolean }>(await ownerSocket.emitWithAck('conversation:join', { conversationId }));
    expect(joinAck.ok).toBe(true);

    // REST send through instance 1 — fanout must cross to instance 2.
    const delivery = waitFor(ownerSocket, 'message:new');
    await request(app1.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ text: 'Birinchi instansiyadan ikkinchisiga!'})
      .expect(201);

    const received = await delivery;
    expect(received.text).toBe('Birinchi instansiyadan ikkinchisiga!');
    ownerSocket.disconnect();
  });

  it('socket-to-socket across instances: send on 1, receive on 2', async () => {
    const owner = await userToken(app1, 'Owner');
    const tenant = await userToken(app1, 'Tenant');
    const property = await createProperty(owner.userId);
    const conv = await request(app1.getHttpServer())
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ propertyId: property.id })
      .expect(201);
    const conversationId = conv.body.data.id as string;

    const ownerSocket = connectTo(port2, await ticketFrom(app1, owner.token));
    await waitReady(ownerSocket);
    await ackData<{ ok: boolean }>(await ownerSocket.emitWithAck('conversation:join', { conversationId }));

    const tenantSocket = connectTo(port1, await ticketFrom(app2, tenant.token));
    await waitReady(tenantSocket);
    await ackData<{ ok: boolean }>(await tenantSocket.emitWithAck('conversation:join', { conversationId }));

    const delivery = waitFor(ownerSocket, 'message:new');
    const ack = ackData<{ ok: boolean }>(
      await tenantSocket.emitWithAck('message:send', {
        conversationId,
        text: 'Socket 1 → Socket 2',
      }),
    );
    expect(ack.ok).toBe(true);

    const received = await delivery;
    expect(received.text).toBe('Socket 1 → Socket 2');
    ownerSocket.disconnect();
    tenantSocket.disconnect();
  });
});
