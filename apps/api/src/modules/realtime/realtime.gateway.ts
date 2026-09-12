import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, type Socket } from 'socket.io';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { SendMessageInput } from '@rentuz/contracts';
import { EventBusService } from '../../common/services/event-bus.service.js';
import { RedisService } from '../../redis/redis.service.js';
import { ConversationsService } from '../conversations/conversations.service.js';
import { MessagesService } from '../conversations/messages.service.js';
import { SocketTicketService } from './socket-ticket.service.js';

const PRESENCE_TTL_SECONDS = 30;
const HEARTBEAT_INTERVAL_MS = 25_000;
const PRESENCE_GRACE_MS = Number(process.env.PRESENCE_GRACE_MS ?? 10_000);

/** §98: 30 messages/min per user over the socket, manual limiter (HTTP throttle guard doesn't reach WS). */
const MESSAGE_RATE_LIMIT = { points: 30, duration: 60 };

function corsOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Socket payload for message:send — SendMessageInput + the conversation routing. */
type SocketSendPayload = { conversationId?: string } & Record<string, unknown>;

/**
 * §28 Socket.IO gateway — ticket handshake, per-conversation rooms, presence.
 * NOTE: the gateway ignores the global `/api/v1` prefix — socket.io serves its
 * own default path on the same port. Persistence lives in MessagesService;
 * this gateway only routes (persist-then-emit is the service's contract).
 */
@WebSocketGateway({
  cors: {
    origin: corsOrigins(),
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  // Native WebSocket upgrades bypass the CORS middleware — engine.io's
  // allowRequest is the only reliable Origin gate for the WS handshake
  // (the error argument is a reason string per engine.io's signature).
  allowRequest: (req, callback) => {
    const origin = req.headers.origin;
    if (!origin || corsOrigins().includes(origin)) {
      callback(null, true);
    } else {
      callback('Origin not allowed', false);
    }
  },
})
export class RealtimeGateway
  implements OnModuleInit, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly logger = new Logger(RealtimeGateway.name);

  /** userId → live sockets on THIS instance (presence grace heuristic). */
  private readonly localSockets = new Map<string, Set<string>>();
  /** socketId → heartbeat interval (cleared on disconnect). */
  private readonly heartbeats = new Map<string, ReturnType<typeof setInterval>>();
  /** userId → pending offline check after grace (cancelled on reconnect). */
  private readonly pendingOffline = new Map<string, ReturnType<typeof setTimeout>>();
  private messageLimiter!: RateLimiterRedis;

  constructor(
    private readonly tickets: SocketTicketService,
    private readonly conversations: ConversationsService,
    private readonly messages: MessagesService,
    private readonly events: EventBusService,
    private readonly redisService: RedisService,
  ) {}

  @WebSocketServer()
  server!: Server;

  onModuleInit(): void {
    // One emit path (§28): services emit on the EventBus; the gateway does
    // ALL io.to(...) fanout so REST and socket sends deliver identically.
    this.events.on('message.created', (payload) => {
      const room = `conv:${payload.conversationId}`;
      this.server.to(room).emit('message:new', payload.message);
      // User rooms: multi-device sync for the sender, list/badge updates for
      // the recipient without joining the conversation room.
      this.server.to(`user:${payload.senderId}`).emit('message:new', payload.message);
      this.server.to(`user:${payload.recipientId}`).emit('message:new', payload.message);
    });
    this.events.on('conversation.created', (payload) => {
      // Both sides see the conversation appear in their list in real time (§27).
      for (const userId of [payload.ownerId, payload.tenantId]) {
        this.server.to(`user:${userId}`).emit('conversation:new', {
          conversationId: payload.conversationId,
          propertyId: payload.propertyId,
          tenantId: payload.tenantId,
        });
      }
    });
  }

  afterInit(server: Server): void {
    this.messageLimiter = new RateLimiterRedis({
      storeClient: this.redisService.client,
      keyPrefix: 'rl:ws-message',
      points: MESSAGE_RATE_LIMIT.points,
      duration: MESSAGE_RATE_LIMIT.duration,
    });
    void server;
  }
  async handleConnection(socket: Socket): Promise<void> {
    const ticket = socket.handshake.auth?.ticket as string | undefined;
    if (!ticket) {
      socket.disconnect(true);
      return;
    }
    let userId: string;
    try {
      userId = await this.tickets.consume(ticket);
    } catch {
      socket.disconnect(true);
      return;
    }
    socket.data.userId = userId;

    // Per-user room (direct emits) + presence room (online fanout).
    await socket.join(`user:${userId}`);
    await socket.join('presence:online');
    this.trackSocket(socket.id, userId);
    // A reconnect inside the grace window cancels the pending offline emit.
    const pendingOffline = this.pendingOffline.get(userId);
    if (pendingOffline) {
      clearTimeout(pendingOffline);
      this.pendingOffline.delete(userId);
    }
    await this.redisService.client.set(`presence:online:${userId}`, '1', 'EX', PRESENCE_TTL_SECONDS);

    // Heartbeat keeps the presence key warm; server-side interval so a silent
    // client (dead tab) still expires correctly.
    const heartbeat = setInterval(() => {
      this.redisService.client
        .set(`presence:online:${userId}`, '1', 'EX', PRESENCE_TTL_SECONDS)
        .catch(() => undefined);
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeats.set(socket.id, heartbeat);

    this.server.to('presence:online').emit('presence:update', { userId, online: true });

    // Connection is fully established (userId set, rooms joined, presence
    // registered) — clients wait for this before emitting anything; the plain
    // socket.io 'connect' fires before handleConnection's async work lands.
    socket.emit('ready', { userId });
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const userId = socket.data?.userId as string | undefined;
    const heartbeat = this.heartbeats.get(socket.id);
    if (heartbeat) clearInterval(heartbeat);
    this.heartbeats.delete(socket.id);
    if (!userId) return;

    this.untrackSocket(socket.id, userId);
    const remaining = this.localSockets.get(userId)?.size ?? 0;
    if (remaining > 0) return; // another device/tab of the same user is live

    // Grace window: a reconnect (network blip, page reload) cancels the
    // offline transition instead of flickering the dot. After the grace the
    // presence key is cleared for good — if the user reconnected in the
    // meantime, their new connection re-created + re-heartbeats the key.
    // (Multi-device/multi-instance edge: local-count heuristics may briefly
    // mis-report; the 30 s TTL is the ultimate authority — documented risk.)
    const pending = this.pendingOffline.get(userId);
    if (pending) clearTimeout(pending);
    this.pendingOffline.set(
      userId,
      setTimeout(() => {
        this.pendingOffline.delete(userId);
        this.redisService.client
          .getdel(`presence:online:${userId}`)
          .then(() => {
            this.server.to('presence:online').emit('presence:update', { userId, online: false });
          })
          .catch(() => undefined);
      }, PRESENCE_GRACE_MS),
    );
  }

  @SubscribeMessage('conversation:join')
  async onConversationJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { conversationId?: string },
  ): Promise<{ ok: boolean; error?: { code: string } }> {
    const userId = socket.data?.userId as string | undefined;
    const conversationId = body?.conversationId;
    if (!userId || typeof conversationId !== 'string') {
      return { ok: false, error: { code: 'NOT_PARTICIPANT' } };
    }
    if (!(await this.conversations.isParticipant(conversationId, userId))) {
      return { ok: false, error: { code: 'NOT_PARTICIPANT' } };
    }
    await socket.join(`conv:${conversationId}`);
    return { ok: true };
  }

  /** Manual Zod parse — the StandardSchema pipe is HTTP-only. */
  @SubscribeMessage('message:send')
  async onMessageSend(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: SocketSendPayload,
  ): Promise<{ ok: boolean; message?: unknown; error?: { code: string; message?: string } }> {
    const userId = socket.data?.userId as string | undefined;
    if (!userId) return { ok: false, error: { code: 'UNAUTHORIZED' } };

    const { conversationId, ...input } = body ?? {};
    const parsed = SendMessageInput.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Xabar formati noto\'g\'ri' } };
    }
    if (typeof conversationId !== 'string') {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'conversationId talab qilinadi' } };
    }

    try {
      // Tests legitimately burst messages — the same escape the HTTP throttle
      // guard honours (DISABLE_THROTTLE) applies to the WS-side limiter.
      if (process.env.DISABLE_THROTTLE !== 'true') {
        await this.messageLimiter.consume(userId);
      }
    } catch {
      return { ok: false, error: { code: 'RATE_LIMITED' } };
    }

    try {
      const message = await this.messages.send(conversationId, userId, parsed.data);
      // Fanout already happened via the message.created EventBus subscription.
      return { ok: true, message };
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'getResponse' in error
          ? ((error as { getResponse: () => { code?: string } }).getResponse().code ?? 'INTERNAL_ERROR')
          : 'INTERNAL_ERROR';
      return { ok: false, error: { code } };
    }
  }

  @SubscribeMessage('message:read')
  async onMessageRead(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { conversationId?: string },
  ): Promise<{ ok: boolean; readAt?: Date }> {
    const userId = socket.data?.userId as string | undefined;
    const conversationId = body?.conversationId;
    if (!userId || typeof conversationId !== 'string') return { ok: false };
    if (!(await this.conversations.isParticipant(conversationId, userId))) return { ok: false };
    const { readAt } = await this.conversations.read(conversationId, userId);
    this.server.to(`conv:${conversationId}`).emit('message:read', {
      userId,
      conversationId,
      readAt,
    });
    return { ok: true, readAt };
  }

  /** Ephemeral typing indicators — no persistence, no lastMessageAt touch (§27). */
  @SubscribeMessage('typing:start')
  async onTypingStart(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { conversationId?: string },
  ): Promise<{ ok: boolean }> {
    return this.relayTyping(socket, body, true);
  }

  @SubscribeMessage('typing:stop')
  async onTypingStop(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { conversationId?: string },
  ): Promise<{ ok: boolean }> {
    return this.relayTyping(socket, body, false);
  }

  onModuleDestroy(): void {
    for (const [, heartbeat] of this.heartbeats) clearInterval(heartbeat);
    for (const [, pending] of this.pendingOffline) clearTimeout(pending);
  }

  // -------------------------------------------------------------- internals

  private async relayTyping(
    socket: Socket,
    body: { conversationId?: string },
    typing: boolean,
  ): Promise<{ ok: boolean }> {
    const userId = socket.data?.userId as string | undefined;
    const conversationId = body?.conversationId;
    if (!userId || typeof conversationId !== 'string') return { ok: false };
    if (!(await this.conversations.isParticipant(conversationId, userId))) return { ok: false };
    // socket.to(...) excludes the sender — they know they're typing.
    socket.to(`conv:${conversationId}`).emit('typing:update', {
      userId,
      conversationId,
      typing,
    });
    return { ok: true };
  }

  private trackSocket(socketId: string, userId: string): void {
    let set = this.localSockets.get(userId);
    if (!set) {
      set = new Set();
      this.localSockets.set(userId, set);
    }
    set.add(socketId);
  }

  private untrackSocket(socketId: string, userId: string): void {
    const set = this.localSockets.get(userId);
    if (!set) return;
    set.delete(socketId);
    if (set.size === 0) this.localSockets.delete(userId);
  }
}
