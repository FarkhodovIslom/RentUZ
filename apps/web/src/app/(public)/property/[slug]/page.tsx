import { notFound, permanentRedirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import type { PublicPropertyDetailDTOT } from '@rentuz/contracts';
import { serverApiGet, ServerApiError } from '@/lib/server-api';
import { PropertyCard } from '@/components/property/PropertyCard';
import { PropertyGallery } from '@/components/property/PropertyGallery';
import { ShareButton } from '@/components/property/ShareButton';
import { LazyMiniMap } from '@/components/property/LazyMiniMap';
import { FavoriteButton } from '@/components/favorites/FavoriteButton';
import { RentalRequestModal } from '@/components/rentals/RentalRequestModal';
import { StartChatButton } from '@/components/chat/StartChatButton';
import { VerificationBadge } from '@/components/property/VerificationBadge';
import { formatPriceUzs, TYPE_OPTIONS } from '@/components/search/filter-utils';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function loadProperty(slug: string): Promise<PublicPropertyDetailDTOT | null> {
  try {
    return await serverApiGet<PublicPropertyDetailDTOT>(`/public/properties/${slug}`);
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const property = await loadProperty(slug);
  if (!property) return { title: 'E’lon topilmadi' };
  const description = property.description.slice(0, 160);
  return {
    title: property.title,
    description,
    openGraph: {
      title: property.title,
      description,
      images: property.mainImageUrl ? [property.mainImageUrl] : undefined,
    },
  };
}

export default async function PropertyDetailsPage({ params }: PageProps) {
  const { slug } = await params;
  let property = await loadProperty(slug);

  // Old UUID URLs 301→308-redirect to the canonical slug (0_Phase.md §2).
  if (!property && UUID_RE.test(slug)) {
    property = await loadProperty(slug);
    if (property) permanentRedirect(`/property/${property.slug}`);
  }
  if (!property) notFound();

  const t = await getTranslations('property');
  const tAmenities = await getTranslations('owner.wizard.amenities');

  const typeLabel = TYPE_OPTIONS.find((o) => o.value === property.type)?.label ?? property.type;
  const memberSince = new Intl.DateTimeFormat('uz-UZ', {
    year: 'numeric',
    month: 'long',
    timeZone: 'Asia/Tashkent',
  }).format(new Date(property.ownerCard.memberSince));

  const specs: { label: string; value: string }[] = [
    { label: 'Xonalar', value: `${property.rooms}` },
    { label: 'Yotoqxona', value: `${property.bedrooms}` },
    { label: 'Hammom', value: `${property.bathrooms}` },
    { label: 'Maydon', value: `${Math.round(property.area)} m²` },
    ...(property.floor !== null
      ? [
          {
            label: 'Qavat',
            value: property.totalFloors !== null ? `${property.floor}/${property.totalFloors}` : `${property.floor}`,
          },
        ]
      : []),
    ...(property.renovation ? [{ label: 'Ta’mir', value: property.renovation }] : []),
    {
      label: 'Mebel',
      value: property.furnished === 'FULL' ? 'To‘liq' : property.furnished === 'PARTIAL' ? 'Qismiy' : 'Yo‘q',
    },
  ];

  const flags: { label: string; ok: boolean }[] = [
    { label: 'Hayvonlar', ok: property.petsAllowed },
    { label: 'Chekish', ok: property.smokingAllowed },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:pb-10">
      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-8">
          <PropertyGallery
            images={property.images.map((i) => ({ id: i.id, url: i.url, width: i.width, height: i.height }))}
            title={property.title}
          />

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{property.title || t('noTitle')}</h1>
              {property.isVerified ? <VerificationBadge /> : null}
            </div>
            <p className="mt-1 text-sm text-fg-secondary">{property.address}</p>
            <p className="mt-3 text-2xl font-bold text-primary">
              {formatPriceUzs(property.price)} <span className="text-sm text-fg-muted">{property.currency}</span>
              <span className="ml-2 text-sm font-normal text-fg-muted">/ {property.period === 'month' ? 'oy' : property.period}</span>
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              {typeLabel} · {t('views', { count: property.views })}
            </p>
          </div>

          <section aria-label="Xususiyatlar" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {specs.map((s) => (
              <div key={s.label} className="rounded-[12px] border border-border bg-card p-3">
                <p className="text-xs text-fg-muted">{s.label}</p>
                <p className="text-sm font-semibold">{s.value}</p>
              </div>
            ))}
          </section>

          {property.amenities.length > 0 ? (
            <section aria-label="Qulayliklar">
              <h2 className="mb-3 text-lg font-semibold">Qulayliklar</h2>
              <ul className="flex flex-wrap gap-2">
                {property.amenities.map((key) => (
                  <li key={key} className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-fg-secondary">
                    {tAmenities.has(key) ? tAmenities(key) : key}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-label="Tavsif">
            <h2 className="mb-3 text-lg font-semibold">Tavsif</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-fg-secondary">{property.description}</p>
          </section>

          {property.lat !== null && property.lng !== null ? (
            <section aria-label="Joylashuv">
              <h2 className="mb-3 text-lg font-semibold">Joylashuv</h2>
              <LazyMiniMap lng={property.lng} lat={property.lat} label={property.address} />
            </section>
          ) : null}

          {property.similar.length > 0 ? (
            <section aria-label="O'xshash e'lonlar">
              <h2 className="mb-3 text-lg font-semibold">{t('similar')}</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {property.similar.map((card) => (
                  <PropertyCard key={card.id} property={card} />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {/* Owner card — sticky on desktop (§20). */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="space-y-4 rounded-[16px] border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              {property.ownerCard.avatar ? (
                <img
                  src={property.ownerCard.avatar}
                  alt={property.ownerCard.name}
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <span className="grid h-12 w-12 place-items-center rounded-full bg-elevated text-lg font-semibold text-fg-secondary">
                  {property.ownerCard.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div>
                <p className="font-semibold">{property.ownerCard.name}</p>
                <p className="text-xs text-fg-muted">
                  {property.ownerCard.isPhoneVerified ? '✓ Tasdiqlangan · ' : ''}
                  {memberSince}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <StartChatButton propertyId={property.id} />
              <RentalRequestModal
                propertyId={property.id}
                price={property.price}
                currency={property.currency}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <FavoriteButton propertyId={property.id} variant="detail" />
              <ShareButton title={property.title} url={`/property/${property.slug}`} />
            </div>

            <ul className="space-y-1.5 text-xs text-fg-muted">
              {flags.map((f) => (
                <li key={f.label} className={f.ok ? 'text-success' : 'line-through'}>
                  {f.label} {f.ok ? 'ruxsat' : 'ruxsat yo‘q'}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {/* Mobile sticky CTA (§20). */}
      <div className="fixed inset-x-0 bottom-16 z-40 border-t border-border bg-bg/95 p-3 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <p className="text-base font-bold text-primary">
            {formatPriceUzs(property.price)} {property.currency}
            <span className="text-xs font-normal text-fg-muted"> / oy</span>
          </p>
          <div className="flex items-center gap-2">
            <FavoriteButton propertyId={property.id} variant="card" />
            <RentalRequestModal
              propertyId={property.id}
              price={property.price}
              currency={property.currency}
              variant="compact"
            />
            <StartChatButton propertyId={property.id} variant="compact" />
          </div>
        </div>
      </div>
    </div>
  );
}
