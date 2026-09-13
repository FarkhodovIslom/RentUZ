/**
 * Sentry browser config (8_Phase.md §1.5 item 31) — DSN-gated: without
 * NEXT_PUBLIC_SENTRY_DSN the init is a no-op, so dev/CI never ship events.
 * Sample rates: 0.1 in production, 1.0 otherwise (§72).
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // PII (§99): never send phone numbers or auth material to Sentry.
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.user) {
        delete event.user.email;
        delete event.user.phoneNumber;
      }
      return event;
    },
  });
}
