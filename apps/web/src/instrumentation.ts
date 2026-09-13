/**
 * Sentry server config for the web app (RSC + route handlers) — same gating
 * and sampling as the client config (8_Phase.md §1.5 item 31).
 */
import * as Sentry from '@sentry/nextjs';

/**
 * Sentry server init for the web app (RSC + route handlers) — DSN-gated:
 * without NEXT_PUBLIC_SENTRY_DSN nothing loads (dev/CI ship no events).
 * Sampling: 0.1 in production, 1.0 otherwise (§72 / 8_Phase.md §1.5 item 31).
 */
export async function register(): Promise<void> {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    sendDefaultPii: false,
  });
}
