'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

/**
 * Admin nav link (§49) — rendered client-side so the public layouts can stay
 * RSC-cached (ISR). The Navbar used to read the session server-side, which
 * forced every public page dynamic (DYNAMIC_SERVER_USAGE — Phase 8 ISR fix).
 * The API still re-enforces AdminGuard on every /admin call; this is UI only.
 */
export function AdminNavLink({ label }: { label: string }) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ role: string }>('/users/me')
      .then((me) => {
        if (!cancelled) setIsAdmin(me.role === 'ADMIN');
      })
      .catch(() => {
        // Anonymous / error — no admin link.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isAdmin) return null;
  return (
    <a href="/admin" className="font-medium text-primary underline-offset-4 hover:text-primary-hover hover:underline" data-testid="nav-admin-link">
      {label}
    </a>
  );
}
