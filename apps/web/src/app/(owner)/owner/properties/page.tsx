import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Badge } from '@rentuz/ui';
import { api } from '@/lib/api';

type OwnerListing = {
  id: string;
  slug: string;
  title: string;
  status: string;
  priceUzs: number;
  currency: string;
  createdAt: string;
};

const STATUS_VARIANT: Record<string, 'success' | 'primary' | 'error' | 'info' | 'neutral' | 'outline'> = {
  ACTIVE: 'success',
  PENDING_VERIFICATION: 'info',
  DRAFT: 'neutral',
  PAUSED: 'outline',
  RENTED: 'primary',
  REJECTED: 'error',
  DELETED: 'error',
};

export default async function OwnerPropertiesPage() {
  const t = await getTranslations('owner.properties');

  let listings: OwnerListing[] = [];
  try {
    listings = (await api.get<OwnerListing[]>('/properties/me')) ?? [];
  } catch {
    listings = [];
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Link
          href="/owner/properties/create"
          className="inline-flex h-11 min-h-11 items-center rounded-[12px] bg-primary px-4 text-sm font-medium text-black hover:bg-primary-hover"
        >
          {t('new')}
        </Link>
      </header>

      {listings.length === 0 ? (
        <EmptyState
          title={t('empty')}
          action={
            <Link
              href="/owner/properties/create"
              className="inline-flex h-11 min-h-11 items-center rounded-[12px] bg-primary px-4 text-sm font-medium text-black hover:bg-primary-hover"
            >
              {t('emptyCta')}
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-[12px] border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-elevated text-left text-xs uppercase text-fg-muted">
              <tr>
                <th className="px-4 py-3">Sarlavha</th>
                <th className="px-4 py-3">Narx</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Amal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {listings.map((p) => (
                <tr key={p.id} className="hover:bg-elevated/50">
                  <td className="px-4 py-3">
                    <Link href={`/owner/properties/${p.id}/edit`} className="font-medium hover:text-primary">
                      {p.title || '(sarlavha kiritilmagan)'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-fg-secondary">
                    {new Intl.NumberFormat('uz-UZ').format(p.priceUzs / 100)} {p.currency}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[p.status] ?? 'neutral'}>{p.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/owner/properties/${p.id}/edit`}
                      className="rounded-[12px] border border-border px-3 py-1.5 text-xs text-fg hover:bg-elevated"
                    >
                      {t('actions.edit')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
