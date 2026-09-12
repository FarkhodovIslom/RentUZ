import type { MetadataRoute } from 'next';
import type { PropertyCardDTOT } from '@rentuz/contracts';
import { serverApiGet } from '@/lib/server-api';

export const revalidate = 3600;

/** Minimal sitemap (§69 basics — full SEO pass is Phase 8). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/rentals`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/map`, changeFrequency: 'daily', priority: 0.7 },
  ];

  const propertyEntries: MetadataRoute.Sitemap = [];
  try {
    for (let page = 1; page <= 5; page++) {
      const payload = await serverApiGet<{ data: PropertyCardDTOT[]; meta: { total: number } }>(
        `/search/properties?limit=100&page=${page}`,
      );
      for (const card of payload.data) {
        propertyEntries.push({
          url: `${base}/property/${card.slug}`,
          lastModified: card.createdAt,
          changeFrequency: 'daily',
          priority: 0.8,
        });
      }
      if (payload.data.length < 100) break;
    }
  } catch {
    // API down — static entries still ship.
  }

  return [...staticEntries, ...propertyEntries];
}
