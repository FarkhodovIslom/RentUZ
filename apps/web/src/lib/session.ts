import { cookies } from 'next/headers';
import type { UserDTOT } from '@rentuz/contracts';

/**
 * Server-side session helpers — read the BFF cookie directly and call the API
 * server-to-server (INTERNAL_API_URL), avoiding a round trip through our own
 * HTTP layer (0_Phase.md §2).
 */
const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

export async function getSession(): Promise<UserDTOT | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('rentuz_at')?.value;
  if (!accessToken) return null;

  const response = await fetch(`${INTERNAL_API_URL}/api/v1/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}`, Cookie: `rentuz_at=${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as { success: boolean; data?: UserDTOT };
  return payload.success && payload.data ? payload.data : null;
}

export async function requireSession(): Promise<UserDTOT> {
  const session = await getSession();
  if (!session) {
    const { redirect } = await import('next/navigation');
    redirect('/login');
  }
  // redirect() throws, so past this line the session is non-null.
  return session as UserDTOT;
}

/**
 * Admin gating (§49). No session → /login; a signed-in non-admin (or a
 * suspended admin — UserDTO carries status) → /forbidden. The API enforces
 * the same rule server-side (AdminGuard); this is the shell-level redirect.
 */
export async function requireRole(role: UserDTOT['role']): Promise<UserDTOT> {
  const session = await requireSession();
  if (session.role !== role || session.status !== 'ACTIVE') {
    const { redirect } = await import('next/navigation');
    redirect('/forbidden');
  }
  return session;
}
