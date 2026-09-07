import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';

const MAX_BASE_LENGTH = 160;

/** Lightweight Uzbek-friendly slug: lowercase, [a-z0-9-], collisions get a 6-char suffix. */
@Injectable()
export class SlugService {
  constructor(private readonly prisma: PrismaService) {}

  toBase(title: string): string {
    const cleaned = title
      .toLowerCase()
      .replace(/[‘’']/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    return cleaned.slice(0, MAX_BASE_LENGTH);
  }

  async unique(title: string): Promise<string> {
    const base = this.toBase(title) || 'property';
    for (let attempt = 0; attempt < 5; attempt++) {
      const suffix = randomBytes(3).toString('hex'); // 6 hex chars
      const candidate = `${base}-${suffix}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = await (this.prisma.properties as any).findUnique({ where: { slug: candidate } });
      if (!existing) return candidate;
    }
    // Last resort: base + 12 chars
    return `${base}-${randomBytes(6).toString('hex')}`;
  }
}
