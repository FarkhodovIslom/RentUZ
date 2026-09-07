import { describe, expect, it } from 'vitest';
import { SlugService } from './slug.service.js';

// SlugService depends on PrismaService only for the unique() lookup. For unit
// testing we just exercise the toBase formatter (collision logic is integration).

const stubPrisma = {} as never;
const slug = new SlugService(stubPrisma);

describe('SlugService.toBase', () => {
  it('lowercases and replaces non-alphanumeric with -', () => {
    expect(slug.toBase("2 xonali Toshkent! markazida.")).toBe('2-xonali-toshkent-markazida');
  });

  it('removes smart quotes and punctuation', () => {
    expect(slug.toBase("Yangi ta'mirlangan, 65 m²")).toBe('yangi-tamirlangan-65-m');
  });

  it('collapses repeated separators and trims', () => {
    expect(slug.toBase('---hello---world---')).toBe('hello-world');
  });

  it('caps length at 160', () => {
    const long = 'a'.repeat(200);
    expect(slug.toBase(long)).toHaveLength(160);
  });

  it('returns empty when input strips to empty (unique() falls back to "property")', () => {
    expect(slug.toBase('!!!')).toBe('');
  });
});
