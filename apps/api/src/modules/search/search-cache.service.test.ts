import { describe, expect, it } from 'vitest';
import { cacheKeyHash, normalizeParams } from './search-cache.service.js';

describe('normalizeParams', () => {
  it('sorts object keys recursively so param order never changes the hash', () => {
    const a = { page: 1, type: 'APARTMENT', nested: { z: 1, a: 2 } };
    const b = { nested: { a: 2, z: 1 }, type: 'APARTMENT', page: 1 };
    expect(normalizeParams(a)).toEqual(normalizeParams(b));
  });

  it('drops undefined values', () => {
    expect(normalizeParams({ a: undefined, b: 1 })).toEqual({ b: 1 });
    expect(JSON.stringify(normalizeParams({ a: undefined }))).toBe('{}');
  });

  it('maps arrays element-wise', () => {
    expect(normalizeParams([{ b: 1, a: 2 }, 3])).toEqual([{ a: 2, b: 1 }, 3]);
  });
});

describe('cacheKeyHash', () => {
  it('is deterministic across key order', () => {
    expect(cacheKeyHash({ limit: 20, page: 2, sort: 'newest' })).toBe(
      cacheKeyHash({ sort: 'newest', page: 2, limit: 20 }),
    );
  });

  it('ignores undefined-valued keys', () => {
    expect(cacheKeyHash({ city: undefined, page: 1 })).toBe(cacheKeyHash({ page: 1 }));
  });

  it('distinguishes different values', () => {
    expect(cacheKeyHash({ page: 1 })).not.toBe(cacheKeyHash({ page: 2 }));
  });
});
