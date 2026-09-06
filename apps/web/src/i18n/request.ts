import { getRequestConfig } from 'next-intl/server';

// Single-locale setup (uz) — no [locale] segment, no middleware (0_Phase §2).
export default getRequestConfig(async () => ({
  locale: 'uz',
  messages: (await import('../messages/uz.json')).default,
}));
