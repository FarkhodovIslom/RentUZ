import { requireSession } from '@/lib/session';
import { AnalyticsView } from '@/components/owner/AnalyticsView';

/** §34 analytics — guard server-side, data client-side (TanStack Query). */
export default async function OwnerAnalyticsPage() {
  await requireSession();
  return <AnalyticsView />;
}
