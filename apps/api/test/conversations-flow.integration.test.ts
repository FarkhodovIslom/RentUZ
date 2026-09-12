import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import Redis from 'ioredis';
import { io as ioc, type Socket } from 'socket.io-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Phase 5 integration suite — conversations, messages, realtime gateway,
 * tickets, attachments (5_Phase.md §3). Runs against the live docker stack
 * (PostGIS :5434, Redis :6379, MinIO :9000). The boot mirrors main.ts
 * including the WS adapter (0_Phase trap 13).
 */

const DB_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5434/rentuz?schema=public&search_path=public,extensions';

const WEB_ORIGIN = 'http://localhost:3000';

process.env.PRESENCE_GRACE_MS ??= '2000'; // snappy offline assertions

let app: INestApplication;
let httpPort = 0;
let prisma: PrismaClient;
let redis: Redis;

async function boot(): Promise<void> {
  const { AppModule } = await import('../src/app.module.js');
  const { NestFactory } = await import('@nestjs/core');
  const { StandardSchemaValidationPipe } = await import('@nestjs/common');
  const cookieParser = (await import('cookie-parser')).default;
  const { RedisIoAdapter } = await import('../src/modules/realtime/redis-io.adapter.js');
  app = await NestFactory.create(AppModule, { logger: false });
  app.use(cookieParser());
  app.useGlobalPipes(new StandardSchemaValidationPipe({ transform: true }));
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready'] });
  app.useWebSocketAdapter(new RedisIoAdapter(app));
  await app.init();
  // Ephemeral port: the real server (not just init) so sockets can connect.
  const server = app.getHttpServer() as { listen: (port: number, cb: () => void) => void };
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  const address = (app.getHttpServer() as { address: () => { port: number } }).address();
  httpPort = address.port;
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

async function userToken(
  name = 'User',
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

async function createProperty(ownerId: string): Promise<{ id: string; slug: string }> {
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
    select: { id: true, slug: true },
  });
}

async function ticketFor(token: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/realtime/ticket')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  return res.body.data.ticket as string;
}

function connectSocket(ticket: string, origin = WEB_ORIGIN): Socket {
  return ioc(`http://localhost:${httpPort}`, {
    transports: ['websocket'],
    auth: { ticket },
    extraHeaders: { Origin: origin },
    reconnection: false,
    timeout: 5000,
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

/** Wait for the gateway's 'ready' signal — 'connect' fires before handleConnection's async work (userId, rooms) lands. */
function waitReady(socket: Socket, timeoutMs = 5000): Promise<{ userId: string }> {
  return new Promise<{ userId: string }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for ready')), timeoutMs);
    socket.once('ready', (payload: { userId: string }) => {
      clearTimeout(timer);
      resolve(payload);
    });
    socket.once('connect_error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Waits for the first event matching the predicate. The response-envelope
 * interceptor wraps WS acks like HTTP — data rides in `.data`.
 */
function waitForMatch<T>(
  socket: Socket,
  event: string,
  match: (payload: T) => boolean,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event} match`)), timeoutMs);
    const listener = (payload: T) => {
      if (match(payload)) {
        clearTimeout(timer);
        socket.off(event, listener);
        resolve(payload);
      }
    };
    socket.on(event, listener);
  });
}

/** The envelope interceptor wraps WS acks: { success, data, message }. */
function ackData<T>(ack: unknown): T {
  const wrapped = ack as { data?: T };
  return (wrapped?.data ?? (ack as T));
}

/** Invalid tickets connect then get force-disconnected by handleConnection. */
function expectLateDisconnect(socket: Socket, timeoutMs = 5000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket was not disconnected')), timeoutMs);
    socket.on('disconnect', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

beforeAll(async () => {
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });
  redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  await boot();
}, 30_000);

afterAll(async () => {
  // Force-close live sockets + keep-alive connections before app.close() —
  // HTTP server.close() hangs waiting for open connections otherwise.
  try {
    const { RealtimeGateway } = await import('../src/modules/realtime/realtime.gateway.js');
    const gateway = app.get(RealtimeGateway);
    gateway.server?.disconnectSockets(true);
  } catch {
    // Gateway may already be down — proceed with the rest of teardown.
  }
  try {
    (app.getHttpServer() as { closeAllConnections?: () => void }).closeAllConnections?.();
  } catch {
    // Not available on this Node version — app.close() still runs below.
  }
  // app.close() hangs on the WS/http teardown path somewhere in socket.io —
  // race it with a timeout so the suite teardown is bounded (test process
  // exits anyway; DB/Redis handles are process-scoped).
  await Promise.race([
    (async () => {
      await app?.close();
      await prisma?.$disconnect();
      await redis?.quit();
    })(),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
}, 10_000);

beforeEach(async () => {
  await truncate();
});

describe('Conversations + realtime — Phase 5 (5_Phase.md §3)', () => {
  it('tenant creates a conversation idempotently; second POST returns the same row', async () => {
    const owner = await userToken('Owner');
    const tenant = await userToken('Tenant');
    const property = await createProperty(owner.userId);

    const first = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ propertyId: property.id })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ propertyId: property.id })
      .expect(201);

    expect(first.body.data.id).toBe(second.body.data.id);
    expect(first.body.data.counterpart.id).toBe(owner.userId);
    expect(first.body.data.property.slug).toBe(property.slug);
    expect(first.body.data.unreadCount).toBe(0);
  });

  it('owner cannot chat about their own property (400 CANNOT_CHAT_SELF); anonymous REST is 401', async () => {
    const owner = await userToken('Owner');
    const property = await createProperty(owner.userId);

    const res = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ propertyId: property.id })
      .expect(400);
    expect(res.body.error.code).toBe('CANNOT_CHAT_SELF');

    await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .send({ propertyId: property.id })
      .expect(401);
  });

  it('REST send → socket on the other side receives message:new (persist-then-emit)', async () => {
    const owner = await userToken('Owner');
    const tenant = await userToken('Tenant');
    const property = await createProperty(owner.userId);

    const conv = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ propertyId: property.id })
      .expect(201);
    const conversationId = conv.body.data.id as string;

    // Owner connects + joins the conversation room.
    const ownerSocket = connectSocket(await ticketFor(owner.token));
    await waitReady(ownerSocket);
    const joinAck = ackData<{ ok: boolean }>(await ownerSocket.emitWithAck('conversation:join', { conversationId }));
    expect(joinAck.ok).toBe(true);

    // Tenant sends via REST.
    const pendingMessage = waitFor(ownerSocket, 'message:new');
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ text: 'Salom! Kvartira hali ijarada mi?' })
      .expect(201);

    const received = await pendingMessage;
    expect(received.text).toBe('Salom! Kvartira hali ijarada mi?');
    expect(received.senderId).toBe(tenant.userId);

    // The message list shows it too — the write happened before the emit.
    const list = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .expect(200);
    expect(list.body.data.data.length).toBe(1);

    ownerSocket.disconnect();
  });

  it('socket message:send persists first, then emits; messages land in the conversation list', async () => {
    const owner = await userToken('Owner');
    const tenant = await userToken('Tenant');
    const property = await createProperty(owner.userId);
    const conv = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ propertyId: property.id })
      .expect(201);
    const conversationId = conv.body.data.id as string;

    const ownerSocket = connectSocket(await ticketFor(owner.token));
    await waitReady(ownerSocket);
    await ackData<{ ok: boolean }>(await ownerSocket.emitWithAck('conversation:join', { conversationId }));

    const tenantSocket = connectSocket(await ticketFor(tenant.token));
    await waitReady(tenantSocket);
    await ackData<{ ok: boolean }>(await tenantSocket.emitWithAck('conversation:join', { conversationId }));

    const delivery = waitFor(ownerSocket, 'message:new');
    const ack = ackData<{ ok: boolean }>(
      await tenantSocket.emitWithAck('message:send', {
        conversationId,
        text: 'Socket orqali yuborildi',
      }),
    );
    expect(ack.ok).toBe(true);

    const received = await delivery;
    expect(received.text).toBe('Socket orqali yuborildi');

    const list = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(list.body.data.data[0].text).toBe('Socket orqali yuborildi');

    ownerSocket.disconnect();
    tenantSocket.disconnect();
  });

  it('non-participant cannot join the conversation room (error NOT_PARTICIPANT) nor read messages', async () => {
    const owner = await userToken('Owner');
    const tenant = await userToken('Tenant');
    const stranger = await userToken('Stranger');
    const property = await createProperty(owner.userId);
    const conv = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ propertyId: property.id })
      .expect(201);
    const conversationId = conv.body.data.id as string;

    const strangerSocket = connectSocket(await ticketFor(stranger.token));
    await waitReady(strangerSocket);
    const joinAck = ackData<{ ok: boolean; error?: { code: string } }>(
      await strangerSocket.emitWithAck('conversation:join', { conversationId }),
    );
    expect(joinAck.ok).toBe(false);
    expect(joinAck.error?.code).toBe('NOT_PARTICIPANT');
    strangerSocket.disconnect();

    await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .expect(403);
  });

  it('message:read updates lastReadAt; subsequent unreadCount reflects it', async () => {
    const owner = await userToken('Owner');
    const tenant = await userToken('Tenant');
    const property = await createProperty(owner.userId);
    const conv = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ propertyId: property.id })
      .expect(201);
    const conversationId = conv.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ text: 'Owner javobi 1' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ text: 'Owner javobi 2' })
      .expect(201);

    // Tenant has 2 unread; after read → 0.
    let list = await request(app.getHttpServer())
      .get('/api/v1/conversations')
      .set('Authorization', `Bearer ${tenant.token}`)
      .expect(200);
    const before = (list.body.data.data as Array<{ id: string; unreadCount: number }>).find(
      (c) => c.id === conversationId,
    );
    expect(before?.unreadCount).toBe(2);

    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/read`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .expect(200);

    list = await request(app.getHttpServer())
      .get('/api/v1/conversations')
      .set('Authorization', `Bearer ${tenant.token}`)
      .expect(200);
    const after = (list.body.data.data as Array<{ id: string; unreadCount: number }>).find(
      (c) => c.id === conversationId,
    );
    expect(after?.unreadCount).toBe(0);
  });

  it('typing indicators are ephemeral — nothing persisted, lastMessageAt unchanged', async () => {
    const owner = await userToken('Owner');
    const tenant = await userToken('Tenant');
    const property = await createProperty(owner.userId);
    const conv = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ propertyId: property.id })
      .expect(201);
    const conversationId = conv.body.data.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ text: 'asosiy xabar' })
      .expect(201);
    const before = await prisma.conversations.findUniqueOrThrow({ where: { id: conversationId } });

    const ownerSocket = connectSocket(await ticketFor(owner.token));
    await waitReady(ownerSocket);
    await ackData<{ ok: boolean }>(await ownerSocket.emitWithAck('conversation:join', { conversationId }));
    const tenantSocket = connectSocket(await ticketFor(tenant.token));
    await waitReady(tenantSocket);
    await ackData<{ ok: boolean }>(await tenantSocket.emitWithAck('conversation:join', { conversationId }));

    const typingEvent = waitFor(ownerSocket, 'typing:update');
    await ackData<{ ok: boolean }>(await tenantSocket.emitWithAck('typing:start', { conversationId }));
    const typing = await typingEvent;
    expect(typing).toMatchObject({ userId: tenant.userId, typing: true });

    await ackData<{ ok: boolean }>(await tenantSocket.emitWithAck('typing:stop', { conversationId }));

    const after = await prisma.conversations.findUniqueOrThrow({ where: { id: conversationId } });
    expect(after.lastMessageAt?.toISOString()).toBe(before.lastMessageAt?.toISOString());
    expect(after.lastMessagePreview).toBe(before.lastMessagePreview);

    ownerSocket.disconnect();
    tenantSocket.disconnect();
  });

  it('presence: disconnect clears presence after grace and emits presence:update offline', async () => {
    const owner = await userToken('Owner');
    const tenant = await userToken('Tenant');
    const property = await createProperty(owner.userId);
    const conv = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ propertyId: property.id })
      .expect(201);
    const conversationId = conv.body.data.id as string;

    const ownerSocket = connectSocket(await ticketFor(owner.token));
    await waitReady(ownerSocket);
    await ackData<{ ok: boolean }>(await ownerSocket.emitWithAck('conversation:join', { conversationId }));
    const tenantSocket = connectSocket(await ticketFor(tenant.token));
    await waitReady(tenantSocket);
    await ackData<{ ok: boolean }>(await ownerSocket.emitWithAck('conversation:join', { conversationId }));

    // Skip the tenant's own online:true fanout; wait for their offline event.
    const offline = waitForMatch<{ userId: string; online: boolean }>(
      ownerSocket,
      'presence:update',
      (p) => p.userId === tenant.userId && p.online === false,
      8000,
    );
    tenantSocket.disconnect();

    const update = await offline;
    expect(update.userId).toBe(tenant.userId);
    ownerSocket.disconnect();
  });

  it('ticket is single-use: a second connect with the same ticket is disconnected', async () => {
    const tenant = await userToken('Tenant');
    const ticket = await ticketFor(tenant.token);

    const first = connectSocket(ticket);
    await waitReady(first);

    // Invalid/reused tickets connect first, then handleConnection force-disconnects.
    const second = connectSocket(ticket);
    await Promise.all([
      waitFor(second, 'connect').catch(() => undefined),
      expectLateDisconnect(second, 8000),
    ]);
    first.disconnect();
    second.disconnect();
  });

  it('anonymous socket connect without a ticket is disconnected', async () => {
    const socket = ioc(`http://localhost:${httpPort}`, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 3000,
    });
    // The disconnect may race the connect event — watch for both from the start.
    const done = new Promise<void>((resolve) => {
      socket.on('disconnect', () => resolve());
      socket.on('connect', () => {
        /* handleConnection still force-disconnects after the handshake */
      });
    });
    await done;
    socket.disconnect();
  });

  it('a non-allowed Origin in the WS handshake is rejected (CSRF gate)', async () => {
    const tenant = await userToken('Tenant');
    const ticket = await ticketFor(tenant.token);
    const socket = connectSocket(ticket, 'https://evil.example.com');
    // engine.io allowRequest rejects the handshake outright — no connect event.
    await expect(waitFor(socket, 'connect')).rejects.toThrow();
    socket.disconnect();
  });

  it('suspended tenant cannot send (DB-fresh 403) — even with a pre-suspension JWT', async () => {
    const owner = await userToken('Owner');
    const tenant = await userToken('Tenant');
    const property = await createProperty(owner.userId);
    const conv = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ propertyId: property.id })
      .expect(201);
    const conversationId = conv.body.data.id as string;

    // Suspend AFTER login — JWT still says ACTIVE (trap 14), the service re-reads the DB.
    await prisma.users.update({ where: { id: tenant.userId }, data: { status: 'SUSPENDED' } });

    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ text: 'suspensiondan keyin' })
      .expect(403);
  });

  it('attachments: 5 OK / 6th rejected / SVG magic bytes rejected / non-participant 403', async () => {
    const owner = await userToken('Owner');
    const tenant = await userToken('Tenant');
    const stranger = await userToken('Stranger');
    const property = await createProperty(owner.userId);
    const conv = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ propertyId: property.id })
      .expect(201);
    const conversationId = conv.body.data.id as string;

    // A minimal valid PNG (200×200) built in-test.
    const { default: sharp } = await import('sharp');
    const png = await sharp({
      create: { width: 200, height: 200, channels: 3, background: '#334455' },
    })
      .png()
      .toBuffer();

    // One call carrying 5 files (FilesInterceptor parses the `files` array).
    const upload5 = request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/attachments`)
      .set('Authorization', `Bearer ${tenant.token}`);
    for (let i = 0; i < 5; i++) upload5.attach('files', png, `file-${i}.png`);
    const metas: Array<{ key: string; mime: string; width: number; height: number; size: number }> =
      (await upload5.expect(201)).body.data;
    expect(metas.length).toBe(5);
    expect(metas[0]!.key).toMatch(new RegExp(`^chat/${conversationId}/[0-9a-f]+/800\\.webp$`));
    expect(metas[0]!.mime).toBe('image/webp');

    // A message carrying 6 attachments is rejected by the contract (§94 ≤5).
    const six = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ attachments: [...metas, metas[0]!] })
      .expect(400);

    // SVG rejected at magic bytes (server sniffing).
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/attachments`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .attach('files', svg, 'evil.svg')
      .expect(400);

    // Non-participant cannot upload.
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/attachments`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .attach('files', png, 'x.png')
      .expect(403);

    // Attachment-only message with the 5 metas goes through and stores empty text.
    const sent = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ attachments: metas })
      .expect(201);
    expect(sent.body.data.text).toBe('');
    expect(sent.body.data.attachments.length).toBe(5);
    expect(six.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('attachment keys from another conversation are rejected (INVALID_ATTACHMENT_KEY)', async () => {
    const owner = await userToken('Owner');
    const tenant = await userToken('Tenant');
    const property = await createProperty(owner.userId);
    const convA = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ propertyId: property.id })
      .expect(201);
    // Same triple → same conversation (idempotent). Create a second property for B.
    const property2 = await createProperty(owner.userId);
    const convB2 = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ propertyId: property2.id })
      .expect(201);

    const { default: sharp } = await import('sharp');
    const png = await sharp({
      create: { width: 200, height: 200, channels: 3, background: '#334455' },
    })
      .png()
      .toBuffer();

    const upload = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${convA.body.data.id}/attachments`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .attach('files', png, 'a.png')
      .expect(201);
    const foreignMeta = (upload.body.data as Array<{ key: string; mime: string; width: number; height: number; size: number }>)[0]!;

    // Attaching conv-A's key to conv-B is containment theft — 400.
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${convB2.body.data.id}/messages`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ attachments: [foreignMeta] })
      .expect(400);
  });

  it('signed URL endpoint: 200 with 600 s expiry; keys are private (not publicly listable)', async () => {
    const owner = await userToken('Owner');
    const tenant = await userToken('Tenant');
    const property = await createProperty(owner.userId);
    const conv = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ propertyId: property.id })
      .expect(201);
    const conversationId = conv.body.data.id as string;

    const { default: sharp } = await import('sharp');
    const png = await sharp({
      create: { width: 200, height: 200, channels: 3, background: '#334455' },
    })
      .png()
      .toBuffer();
    const upload = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/attachments`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .attach('files', png, 'a.png')
      .expect(201);
    const meta = (upload.body.data as Array<{ key: string }>)[0]!;

    const signed = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversationId}/attachments/url?key=${encodeURIComponent(meta.key)}`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .expect(200);
    expect(signed.body.data.expiresIn).toBe(600);
    expect(signed.body.data.url).toContain('X-Amz-Signature');

    // A key outside this conversation's prefix is refused.
    await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversationId}/attachments/url?key=${encodeURIComponent('chat/other/1/800.webp')}`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .expect(403);
  });

  it('cursor pagination: before=<id> returns strictly older messages with hasMore', async () => {
    const owner = await userToken('Owner');
    const tenant = await userToken('Tenant');
    const property = await createProperty(owner.userId);
    const conv = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${tenant.token}`)
      .send({ propertyId: property.id })
      .expect(201);
    const conversationId = conv.body.data.id as string;

    for (let i = 1; i <= 5; i++) {
      await request(app.getHttpServer())
        .post(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${tenant.token}`)
        .send({ text: `xabar ${i}` })
        .expect(201);
    }

    const page1 = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversationId}/messages?limit=2`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .expect(200);
    expect(page1.body.data.data.length).toBe(2);
    expect(page1.body.data.hasMore).toBe(true);
    expect(page1.body.data.data[0].text).toBe('xabar 5');

    const cursor = page1.body.data.data[1].id as string;
    const page2 = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversationId}/messages?limit=2&before=${cursor}`)
      .set('Authorization', `Bearer ${tenant.token}`)
      .expect(200);
    expect(page2.body.data.data.length).toBe(2);
    // Strictly older than the cursor (message 4) — the newest page-2 row is message 3.
    expect(page2.body.data.data[0].text).toBe('xabar 3');
    expect(page2.body.data.hasMore).toBe(true);
  });
});
