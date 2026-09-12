import { requireSession } from '@/lib/session';
import { DashboardClient } from '@/components/owner/DashboardClient';

/** §31 — authenticated RSC guard; data (KPIs, requests, top listings) is
 *  fetched client-side with TanStack Query so invalidation after request
 *  actions and the analytics page share one cache. Real data since Phase 6. */
export default async function OwnerDashboardPage() {
  const session = await requireSession();
  return <DashboardClient sessionName={session.name} />;
}
