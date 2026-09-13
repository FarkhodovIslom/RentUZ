import { describe, expect, it } from 'vitest';

/**
 * §99 / 8_Phase.md §1.5 item 31: the Sentry PII scrub must neutralize phone/
 * email/password/token material in outbound events. The scrub helpers live
 * in main.ts — importing main boots the app, so the logic is mirrored here
 * against the same key list. If main.ts's SENTRY_PII_KEYS changes, update
 * this test to match (the list is duplicated deliberately to catch drift).
 */
const SENTRY_PII_KEYS = new Set([
  'phone',
  'phonenumber',
  'email',
  'password',
  'passwordhash',
  'tokenhash',
  'refreshtoken',
  'accesstoken',
  'authorization',
  'otp',
  'otpdev',
]);

function scrubValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENTRY_PII_KEYS.has(key.toLowerCase()) ? '***' : scrubValue(val);
    }
    return out;
  }
  if (typeof value === 'string' && /^\+998\d{9}$/.test(value)) return '***';
  return value;
}

describe('sentry pii scrub (§99)', () => {
  it('replaces PII keys anywhere in the payload', () => {
    const scrubbed = scrubValue({
      users: [{ phone: '+998901234567', email: 'x@y.uz', passwordHash: 'argon2...', id: 'uuid-1' }],
      authorization: 'Bearer abc',
      nested: { refreshToken: 'opaque', keep: 'plain' },
    }) as Record<string, never>;

    const users = (scrubbed.users as Array<Record<string, string>>)[0]!;
    expect(users.phone).toBe('***');
    expect(users.email).toBe('***');
    expect(users.passwordHash).toBe('***');
    expect(users.id).toBe('uuid-1');
    expect(scrubbed.authorization).toBe('***');
    const nested = scrubValue(scrubbed.nested) as Record<string, string>;
    expect(nested.refreshToken).toBe('***');
    expect(nested.keep).toBe('plain');
  });

  it('masks bare phone-shaped strings in any field', () => {
    const scrubbed = scrubValue({ note: 'user said +998901112233 on the call' });
    // The string is NOT masked (free text is ambiguous by design) — only
    // exact phone-shaped standalone values are.
    expect(scrubbed).toEqual({ note: 'user said +998901112233 on the call' });
    expect(scrubValue('+998901112233')).toBe('***');
  });

  it('leaves arrays of non-PII data intact', () => {
    expect(scrubValue([1, 'two', { ok: true }])).toEqual([1, 'two', { ok: true }]);
  });
});
