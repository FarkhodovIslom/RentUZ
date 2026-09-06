import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private connected = false;

  constructor() {
    // Prisma 7: the connection URL is passed through a driver adapter, not the
    // schema file. Migrations use the direct URL from prisma.config.ts instead.
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }

  async onModuleInit(): Promise<void> {
    // Tolerant connect (Phase 0 boot gate): a missing DB must not crash the API.
    // `/ready` performs a live query and reports unhealthy instead.
    try {
      await this.$connect();
      this.connected = true;
    } catch (error) {
      console.warn(
        '[prisma] database connect failed (readiness will report unhealthy):',
        error instanceof Error ? error.message : error,
      );
    }
  }

  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connected) {
      await this.$disconnect();
    }
  }
}
