import { describe, expect, it } from 'vitest';
import {
  DOMAIN_ERROR_CODES,
  ERROR_CODES,
  domainErrorCodeSchema,
  errorCodeSchema,
} from './error-codes.js';
import { buildPaginationMeta, paginationQuerySchema } from './pagination.js';

describe('paginationQuerySchema', () => {
  it('coerces query-string values and applies defaults', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(paginationQuerySchema.parse({ page: '3', limit: '50' })).toEqual({ page: 3, limit: 50 });
  });

  it('rejects limit above the hard cap of 100', () => {
    expect(() => paginationQuerySchema.parse({ limit: '101' })).toThrow();
  });

  it('rejects non-positive page', () => {
    expect(() => paginationQuerySchema.parse({ page: '0' })).toThrow();
  });
});

describe('buildPaginationMeta', () => {
  it('computes totalPages and floors at 1', () => {
    expect(buildPaginationMeta(1, 20, 120)).toEqual({
      page: 1,
      limit: 20,
      total: 120,
      totalPages: 6,
    });
    expect(buildPaginationMeta(1, 20, 0).totalPages).toBe(1);
  });
});

describe('errorCodeSchema', () => {
  it('accepts every declared common code', () => {
    for (const code of ERROR_CODES) {
      expect(errorCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it('accepts every declared domain code', () => {
    for (const code of DOMAIN_ERROR_CODES) {
      expect(domainErrorCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it('rejects unknown codes', () => {
    expect(errorCodeSchema.safeParse('NOT_A_CODE').success).toBe(false);
  });
});
