import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { REPORT_REASONS } from '@rentuz/contracts';

/**
 * Phase 7 i18n contract (7_Phase.md §1.8): the fixed report-reason set and
 * the 5-point verification checklist must have Uzbek keys — the admin UI
 * renders them straight from the catalog, so a missing key would leak a raw
 * i18n path into the moderation surface.
 */
const messagesPath = fileURLToPath(new URL('../../../../../apps/web/src/messages/uz.json', import.meta.url));
const uz = JSON.parse(readFileSync(messagesPath, 'utf8')) as {
  admin: {
    reports: { reasons: Record<string, string> };
    verification: { checklist: Record<string, string> };
  };
};

const CHECKLIST_KEYS = [
  'locationMatches',
  'priceInRange',
  'imagesClear',
  'ownerVerifiable',
  'noDuplicates',
];

describe('admin surface ↔ i18n coverage', () => {
  it('every REPORT_REASONS value has an admin.reports.reasons.<REASON> key', () => {
    for (const reason of REPORT_REASONS) {
      expect(uz.admin.reports.reasons[reason], `missing: admin.reports.reasons.${reason}`).toBeTruthy();
    }
  });

  it('the 5-point verification checklist has all keys', () => {
    for (const key of CHECKLIST_KEYS) {
      expect(uz.admin.verification.checklist[key], `missing: admin.verification.checklist.${key}`).toBeTruthy();
    }
  });
});
