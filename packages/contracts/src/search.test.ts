import { describe, expect, it } from 'vitest';
import { MapInput, SearchInput } from './search.js';

describe('SearchInput', () => {
  it('applies defaults for an empty query', () => {
    expect(SearchInput.parse({})).toEqual({ sort: 'newest', page: 1, limit: 20 });
  });

  it('coerces numeric strings from the URL', () => {
    const parsed = SearchInput.parse({
      minPrice: '3500000',
      maxPrice: '7000000',
      rooms: '2',
      minArea: '40.5',
      lat: '41.3111',
      lng: '69.2401',
      radius: '5000',
      page: '2',
      limit: '40',
    });
    expect(parsed.minPrice).toBe(3_500_000);
    expect(parsed.maxPrice).toBe(7_000_000);
    expect(parsed.rooms).toBe(2);
    expect(parsed.minArea).toBe(40.5);
    expect(parsed.lat).toBe(41.3111);
    expect(parsed.radius).toBe(5000);
    expect(parsed.page).toBe(2);
    expect(parsed.limit).toBe(40);
  });

  it('coerces boolean-ish query values and rejects junk', () => {
    expect(SearchInput.parse({ verified: 'true' }).verified).toBe(true);
    expect(SearchInput.parse({ pets: 'false' }).pets).toBe(false);
    expect(SearchInput.parse({ smoking: '1' }).smoking).toBe(true);
    expect(SearchInput.parse({ pets: '0' }).pets).toBe(false);
    expect(SearchInput.safeParse({ verified: 'maybe' }).success).toBe(false);
  });

  it('rejects radius outside 100–50000 meters', () => {
    expect(SearchInput.safeParse({ radius: '50' }).success).toBe(false);
    expect(SearchInput.safeParse({ radius: '60000' }).success).toBe(false);
    expect(SearchInput.safeParse({ radius: '100' }).success).toBe(true);
  });

  it('rejects inverted price and area ranges', () => {
    expect(SearchInput.safeParse({ minPrice: '10', maxPrice: '5' }).success).toBe(false);
    expect(SearchInput.safeParse({ minArea: '90', maxArea: '60' }).success).toBe(false);
    expect(SearchInput.safeParse({ minPrice: '5', maxPrice: '10' }).success).toBe(true);
  });

  it('rejects invalid enum values and non-uuid city ids', () => {
    expect(SearchInput.safeParse({ type: 'CASTLE' }).success).toBe(false);
    expect(SearchInput.safeParse({ sort: 'cheapest' }).success).toBe(false);
    expect(SearchInput.safeParse({ city: 'toshkent' }).success).toBe(false);
    expect(SearchInput.safeParse({ furnished: 'EURO' }).success).toBe(false);
  });

  it('caps limit at 100', () => {
    expect(SearchInput.safeParse({ limit: '101' }).success).toBe(false);
    expect(SearchInput.parse({ limit: '100' }).limit).toBe(100);
  });
});

describe('MapInput', () => {
  it('requires a full bbox and coerces it', () => {
    const parsed = MapInput.parse({
      swLng: '69.1',
      swLat: '41.2',
      neLng: '69.4',
      neLat: '41.4',
    });
    expect(parsed.swLng).toBe(69.1);
    expect(parsed.neLat).toBe(41.4);
  });

  it('rejects a partial bbox', () => {
    expect(MapInput.safeParse({ swLng: '69.1', swLat: '41.2' }).success).toBe(false);
  });

  it('rejects out-of-range coordinates', () => {
    expect(
      MapInput.safeParse({ swLng: '-200', swLat: '41.2', neLng: '69.4', neLat: '41.4' }).success,
    ).toBe(false);
  });
});
