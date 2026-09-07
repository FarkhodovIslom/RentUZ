import Link from 'next/link';
import { VerificationBadge } from './VerificationBadge';

interface CardData {
  id: string;
  slug: string;
  title: string;
  price: number;
  priceUzs: number;
  currency: string;
  type: string;
  rooms: number;
  area: number;
  address: string;
  mainImageUrl: string | null;
  regionName: string | null;
  isVerified: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  APARTMENT: 'Kvartira',
  HOUSE: 'Uy',
  ROOM: 'Xona',
  COMMERCIAL: 'Tijorat',
  OFFICE: 'Ofis',
  LAND: 'Yer',
  OTHER: 'Boshqa',
};

export function PropertyCard({ property }: { property: CardData }) {
  const priceFormatted = new Intl.NumberFormat('uz-UZ', {
    maximumFractionDigits: 0,
  }).format(property.priceUzs);
  return (
    <Link
      href={`/property/${property.slug}`}
      className="group block overflow-hidden rounded-[12px] border border-border bg-card transition-transform hover:-translate-y-0.5"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-elevated">
        {property.mainImageUrl ? (
                    <img
            src={property.mainImageUrl}
            alt={property.title}
            loading="lazy"
            className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-fg-muted">Rasm yo'q</div>
        )}
        {property.isVerified ? <VerificationBadge className="absolute left-2 top-2" /> : null}
      </div>
      <div className="space-y-1 p-4">
        <h3 className="line-clamp-1 font-semibold">{property.title || '(sarlavha kiritilmagan)'}</h3>
        <p className="line-clamp-1 text-xs text-fg-secondary">
          {property.regionName ? `${property.regionName}, ` : ''}
          {property.address}
        </p>
        <div className="flex items-center justify-between pt-2">
          <p className="text-base font-bold text-primary">
            {priceFormatted} <span className="text-xs text-fg-muted">{property.currency}</span>
          </p>
          <p className="text-xs text-fg-muted">
            {TYPE_LABELS[property.type] ?? property.type} · {property.rooms}x · {Math.round(property.area)} m²
          </p>
        </div>
      </div>
    </Link>
  );
}
