import { describe, expect, it } from 'vitest';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { AUDIT_KEY } from '../../common/decorators/audit.decorator.js';
import { AdminController } from './admin.controller.js';
import { AdminPropertiesController } from '../admin-properties/admin-properties.controller.js';
import { AdminUsersController } from '../admin-users/admin-users.controller.js';
import { VerificationController } from '../verification/verification.controller.js';

/**
 * Phase 8 audit-coverage gate (8_Phase.md §1.3 item 22): every MUTATING
 * /admin route must carry the @Audit decorator — the audit-log interceptor
 * writes an auditLogs row from that metadata (§57). A new admin endpoint
 * without @Audit would silently skip audit logging; this test fails the
 * suite before that can ship. No app boot needed — pure metadata scan of the
 * admin controller classes (the same classes AppModule registers).
 */

// METHOD_METADATA is Nest's numeric RequestMethod enum: 1=POST 2=PUT 3=DELETE 4=PATCH.
const MUTATING = new Set<number>([RequestMethod.POST, RequestMethod.PUT, RequestMethod.DELETE, RequestMethod.PATCH]);

const ADMIN_CONTROLLERS = [
  AdminController,
  AdminPropertiesController,
  AdminUsersController,
  VerificationController,
];

/**
 * Deliberately un-audited mutating routes. `verification/:id/claim` only
 * flips a Redis claim key (no DB mutation, no user-visible state change) —
 * 7_Phase.md §1.2 item 7 decided it stays audit-free. Add entries ONLY with
 * a documented reason; the assertion below shows this list verbatim on
 * failure so drift is reviewed, not silent.
 */
const AUDIT_EXEMPT = new Set(['POST /api/v1/admin/verification/:id/claim']);

describe('admin audit coverage', () => {
  it('every mutating /admin route has @Audit', () => {
    const mutating = new Set<string>();
    const audited = new Set<string>();

    for (const controller of ADMIN_CONTROLLERS) {
      const controllerPath = Reflect.getMetadata(PATH_METADATA, controller) as string;
      expect(controllerPath.startsWith('admin')).toBe(true);

      for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(controller.prototype))) {
        const handler = descriptor.value;
        if (typeof handler !== 'function' || handler === controller) continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
        if (method === undefined || !MUTATING.has(method)) continue;
        const routePath = (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ?? '';
        const full = `/${controllerPath}${routePath.startsWith('/') ? routePath : `/${routePath}`}`;
        const label = `${RequestMethod[method]} /api/v1${full}`;
        mutating.add(label);

        const audit = Reflect.getMetadata(AUDIT_KEY, handler) as { action: string } | undefined;
        if (audit?.action) audited.add(label);
      }
    }

    // The admin surface is non-trivial; a regression here means the import
    // list went stale (a new admin module was added without coverage).
    expect(mutating.size).toBeGreaterThanOrEqual(8);

    const missing = [...mutating].filter((route) => !audited.has(route) && !AUDIT_EXEMPT.has(route));
    expect(
      missing,
      `mutating admin routes missing @Audit (or an undocumented AUDIT_EXEMPT entry): ${missing.join(', ')}`,
    ).toHaveLength(0);
    // Every exemption must still exist in the codebase — a renamed/removed
    // route turns its exemption into dead weight and fails here.
    const staleExemptions = [...AUDIT_EXEMPT].filter((route) => !mutating.has(route));
    expect(staleExemptions, `stale AUDIT_EXEMPT entries (route no longer exists): ${staleExemptions.join(', ')}`).toHaveLength(0);
  });
});
