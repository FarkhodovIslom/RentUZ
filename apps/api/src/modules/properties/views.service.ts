import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RedisService } from '../../redis/redis.service.js';

export const SESSION_COOKIE = 'rz_sid';

/** 36 h covers ±12 h around a day boundary (3_Phase.md §1.3). */
const DEDUP_TTL_SECONDS = 36 * 60 * 60;

/**
 * View tracking (§20 / 3_Phase.md §1.3): dedup via Redis day-key, one
 * propertyViews row per (property, user-or-session, day), live counter
 * increment. Phase 6 replaces the live counter with the nightly batch
 * rebuild — this is the documented transition, not a rewrite.
 */
@Injectable()
export class PropertyViewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Anonymous sessions get a sticky httpOnly `rz_sid` (400 d). */
  resolveSessionId(req: Request, res: Response): string {
    const existing = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (existing) return existing;
    const sid = randomUUID();
    res.cookie(SESSION_COOKIE, sid, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 400 * 24 * 60 * 60 * 1000,
    });
    return sid;
  }

  async record(
    propertyId: string,
    ownerId: string,
    userId: string | null,
    sessionId: string,
  ): Promise<void> {
    if (userId === ownerId) return; // owners never inflate their own counters
    const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const dedupKey = `view:dedup:${propertyId}:${userId ?? sessionId}:${day}`;
    const first = await this.redis.client.set(dedupKey, '1', 'EX', DEDUP_TTL_SECONDS, 'NX');
    if (first !== 'OK') return;
    await this.prisma.propertyViews.create({ data: { propertyId, userId, sessionId } });
    await this.prisma.$executeRaw`UPDATE "properties" SET views = views + 1 WHERE "id" = ${propertyId}::uuid`;
  }
}
