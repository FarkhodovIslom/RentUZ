import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NOTIF_TYPES } from './notifications.js';

/**
 * 6_Phase.md §5 trap: `notifications.types.*` keys must match the NotifType
 * enum — every persisted notification must be renderable. The API derives
 * titleKey from the enum (notification-listeners.camelNotifType), so this
 * reads the web's uz catalog and asserts full coverage.
 */
const messagesPath = fileURLToPath(new URL('../../../apps/web/src/messages/uz.json', import.meta.url));
const uz = JSON.parse(readFileSync(messagesPath, 'utf8')) as {
  notifications: { types: Record<string, string>; bodies: Record<string, Record<string, string>> };
};

const camel = (type: string): string =>
  type.toLowerCase().replace(/_(\w)/g, (_, c: string) => c.toUpperCase());

describe('NotifType ↔ i18n coverage', () => {
  it('every NOTIF_TYPES value has a notifications.types.<camel> key', () => {
    for (const type of NOTIF_TYPES) {
      expect(uz.notifications.types[camel(type)], `missing key: notifications.types.${camel(type)}`).toBeTruthy();
    }
  });

  it('body keys emitted by the API listeners all have templates', () => {
    // Keep in sync with notification-listeners REQUEST_MAPPINGS + direct calls.
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
    ];
    for (const key of bodyKeys) {
      const [ns, leaf] = key.split('.') as [string, string];
      expect(uz.notifications.bodies[ns]?.[leaf], `missing body template: notifications.bodies.${key}`).toBeTruthy();
    }
  });
});
