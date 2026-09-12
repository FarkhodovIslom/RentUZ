import { IoAdapter } from '@nestjs/platform-socket.io';
import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server, ServerOptions } from 'socket.io';

/**
 * §28 realtime scaling — with RENTUZ_REALTIME_SCALE > 1 the Redis adapter
 * fans room emits out across instances (pub/sub pair). Single-instance
 * deployments keep the default in-memory adapter (no-op here).
 *
 * The adapter needs two DEDICATED connections (publish + subscribe) — the
 * shared app client cannot be reused (same constraint the BullMQ module
 * hit: blocking subscriber mode). url parsing mirrors jobs.module.ts.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly scale: number;
  private connections: [Redis, Redis] | null = null;

  constructor(app: INestApplication) {
    super(app as never);
    this.scale = Number(process.env.RENTUZ_REALTIME_SCALE ?? 1);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    if (this.scale > 1) {
      const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
      const connectionOptions = {
        host: url.hostname,
        port: Number(url.port || 6379),
        maxRetriesPerRequest: 2,
      };
      const pubClient = new Redis(connectionOptions);
      const subClient = new Redis(connectionOptions);
      this.connections = [pubClient, subClient];
      return super.createIOServer(port, {
        ...options,
        adapter: createAdapter(pubClient, subClient),
      } as ServerOptions);
    }
    return super.createIOServer(port, options);
  }

  /** Close the dedicated pub/sub pair on shutdown (the app client is closed by RedisModule). */
  override async close(server: Server): Promise<void> {
    for (const conn of this.connections ?? []) {
      void conn.quit().catch(() => conn.disconnect());
    }
    this.connections = null;
    await super.close(server);
  }
}
