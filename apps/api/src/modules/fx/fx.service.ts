import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RedisService } from '../../redis/redis.service.js';
import type { Currency } from '../../generated/prisma/enums.js';

const CACHE_TTL_SECONDS = 3600;

/**
 * Convert a price in a given currency to UZS using the latest fxRates row
 * (context/0_Phase.md §2 — single currency for filtering/sorting).
 */
@Injectable()
export class FxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async toUzs(amount: number, currency: Currency): Promise<bigint> {
    if (currency === 'UZS') return BigInt(Math.round(amount));
    const rate = await this.getRate(currency, 'UZS');
    return BigInt(Math.round(amount * rate));
  }

  async getRate(base: Currency, quote: Currency): Promise<number> {
    if (base === quote) return 1;
    const key = `fx:${base}:${quote}`;
    const cached = await this.redis.client.get(key);
    if (cached !== null) {
      const n = Number(cached);
      if (Number.isFinite(n) && n > 0) return n;
    }
    const row = await this.prisma.fxRates.findFirst({
      where: { base, quote },
      orderBy: { asOf: 'desc' },
    });
    if (!row) throw new NotFoundException({ code: 'FX_RATE_NOT_FOUND' });
    await this.redis.client.set(key, row.rate.toString(), 'EX', CACHE_TTL_SECONDS);
    return Number(row.rate);
  }
}
