import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NOTIF_TYPES } from '@rentuz/contracts';

/**
 * 6_Phase.md §5 trap: `notifications.types.*` keys must match the NotifType
 * enum — NotificationListeners derives `titleKey` from the enum, so a missing
 * web translation key would render a raw i18n path. Reads the web uz catalog
 * and asserts full coverage (lives in the API because the API owns the keys).
 */
// From src/modules/notifications/ up five levels is the repo root.
const messagesPath = fileURLToPath(new URL('../../../../../apps/web/src/messages/uz.json', import.meta.url));
const uz = JSON.parse(readFileSync(messagesPath, 'utf8')) as {
  notifications: { types: Record<string, string>; bodies: Record<string, Record<string, string>> };
};

const camel = (type: string): string =>
  type.toLowerCase().replace(/_(\w)/g, (_, c: string) => c.toUpperCase());

describe('NotifType ↔ i18n coverage', () => {
  it('every NOTIF_TYPES value has a notifications.types.<camel> key', () => {
    for (const type of NOTIF_TYPES) {
      expect(uz.notifications.types[camel(type)], `missing: notifications.types.${camel(type)}`).toBeTruthy();
    }
  });

  it('body keys emitted by the API listeners all have templates', () => {
    const bodyKeys = [
      'request.new',
      'request.accepted',
      'request.rejected',
      'request.cancelled',
      'request.completed',
      'request.expired',
      'message.new',
      'property.verified',
      'property.rejected',
      'price.changed',
      'verification.infoRequested',
    ];
    for (const key of bodyKeys) {
      const [ns, leaf] = key.split('.') as [string, string];
      expect(uz.notifications.bodies[ns]?.[leaf], `missing template: notifications.bodies.${key}`).toBeTruthy();
    }
  });
});
