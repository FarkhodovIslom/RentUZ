import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Authenticated + private surfaces must not be crawled (§69).
        // robots.ts is additive over the file-less default, so list every
        // private route group explicitly.
        disallow: [
          '/api/',
          '/owner',
          '/admin',
          '/chat',
          '/favorites',
          '/profile',
          '/my-rentals',
          '/rental-requests',
          '/notifications',
          '/forbidden',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
