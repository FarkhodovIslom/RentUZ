import type { MetadataRoute } from 'next';
import type { PropertyCardDTOT } from '@rentuz/contracts';
import { serverApiGet } from '@/lib/server-api';

export const revalidate = 3600;

/**
 * Sitemap with pagination (§69 / 8_Phase.md §1.1 item 1): Next's
 * `generateSitemaps` produces /sitemap.xml/<id>.xml chunk files, each capped
 * at SITEMAP_PAGE_SIZE entries so a single file never exceeds the 50k /
 * 50 MB protocol limit. Static pages live in chunk 0.
 */
const SITEMAP_PAGE_SIZE = 50_000;
const STATIC_URLS = ['/', '/rentals', '/map', '/login', '/register', '/forgot-password', '/reset-password', '/privacy', '/terms'];

export async function generateSitemaps(): Promise<{ id: number }[]> {
  let total = 0;
  try {
    const payload = await serverApiGet<{ meta: { total: number } }>('/search/properties?limit=1', {
      next: { revalidate: 3600 },
    });
    total = payload.meta.total;
  } catch {
    // API down — static-only sitemap still ships.
  }
  const propertyPages = Math.ceil(total / SITEMAP_PAGE_SIZE);
  const chunks = 1 + Math.max(0, propertyPages);
  return Array.from({ length: chunks }, (_, id) => ({ id }));
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  if (id === 0) {
    const staticEntries: MetadataRoute.Sitemap = STATIC_URLS.map((path) => ({
      url: `${base}${path}`,
      changeFrequency: 'daily',
      priority: path === '/' ? 1 : 0.6,
    }));
    // Fill chunk 0's remaining capacity with the newest listings so a small
    // catalog (the common case) has a single sitemap URL carrying everything.
    const room = SITEMAP_PAGE_SIZE - staticEntries.length;
    return [...staticEntries, ...(await propertyEntries(base, 0, room))];
  }

  const skipStatic = STATIC_URLS.length;
  return propertyEntries(base, (id - 1) * SITEMAP_PAGE_SIZE + skipStatic, SITEMAP_PAGE_SIZE);
}

async function propertyEntries(base: string, offset: number, limit: number): Promise<MetadataRoute.Sitemap> {
  if (limit <= 0) return [];
  const entries: MetadataRoute.Sitemap = [];
  // Search API caps limit at 100 — walk pages until the chunk is full.
  let page = Math.floor(offset / 100) + 1;
  const offsetInPage = offset % 100;
  try {
    while (entries.length < limit) {
      const payload = await serverApiGet<{ data: PropertyCardDTOT[] }>(
        `/search/properties?limit=100&page=${page}`,
        { next: { revalidate: 3600 } },
      );
      for (const card of payload.data.slice(entries.length === 0 && offsetInPage ? offsetInPage : 0)) {
        if (entries.length >= limit) break;
        entries.push({
          url: `${base}/property/${card.slug}`,
          lastModified: card.createdAt,
          changeFrequency: 'daily',
          priority: 0.8,
        });
      }
      if (payload.data.length < 100) break;
      page++;
    }
  } catch {
    // API down — static entries still ship.
  }
  return entries;
}
