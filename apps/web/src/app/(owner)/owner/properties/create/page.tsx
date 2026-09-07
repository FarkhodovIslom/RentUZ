import { getSession } from '@/lib/session';
import { api } from '@/lib/api';
import { redirect } from 'next/navigation';

/** Server component — creates a DRAFT and redirects to its edit page. */
export default async function NewPropertyPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  // The backend returns `{ id, status }` (envelope-stripped by the client).
  const draft = await api.post<{ id: string }>('/properties');
  redirect(`/owner/properties/${draft.id}/edit`);
}
