import { Injectable, Logger } from '@nestjs/common';
import { EventBusService, PROPERTY_EVENTS, type PropertyEvent, type PropertyEventPayload } from './event-bus.service.js';

/**
 * Phase 8 (8_Phase.md §1.1 item 4): pushes `property.*` events to the web
 * app's `/api/revalidate` ISR hook so cached detail pages + the sitemap pick
 * up mutations immediately instead of waiting out the 10-min revalidate
 * window. Fire-and-forget: failures log, never throw — the Next window is
 * the safety net. Disabled entirely when WEB_INTERNAL_URL/REVALIDATE_SECRET
 * are unset (dev default).
 */
@Injectable()
export class WebRevalidateService {
  private static readonly TIMEOUT_MS = 3_000;
  private readonly logger = new Logger(WebRevalidateService.name);

  constructor(bus: EventBusService) {
    for (const event of PROPERTY_EVENTS) {
      bus.on(event, (payload: PropertyEventPayload) => {
        void this.revalidate(event, payload);
      });
    }
  }

  private async revalidate(event: PropertyEvent, payload: PropertyEventPayload): Promise<void> {
    const base = process.env.WEB_INTERNAL_URL;
    const secret = process.env.REVALIDATE_SECRET;
    if (!base || !secret) return;
    // Rejected/DELETED listings drop out of search — sitemap-wide revalidate
    // covers them; their own cached page dies via the sitemap pass.
    const path =
      event === 'property.price_changed' || event === 'property.verified'
        ? `/property/${payload.propertyId}`
        : null;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), WebRevalidateService.TIMEOUT_MS);
      await fetch(`${base.replace(/\/$/, '')}/api/revalidate`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secret}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ slug: path }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
    } catch (error) {
      this.logger.warn(`revalidate hook failed (${event}): ${String(error)}`);
    }
  }
}
