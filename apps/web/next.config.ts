import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // @rentuz/ui ships TS source (vendored primitives) — transpile on import.
  transpilePackages: ['@rentuz/ui'],
  images: {
    // §68: serve WebP variants (Phase 2's pipeline already emits them; the
    // optimizer re-encodes on the fly for remote URLs).
    formats: ['image/webp'],
    remotePatterns: [
      // Local MinIO (dev) and any host it is addressed by.
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: '*.amazonaws.com' },
    ],
  },
};

export default withNextIntl(nextConfig);
