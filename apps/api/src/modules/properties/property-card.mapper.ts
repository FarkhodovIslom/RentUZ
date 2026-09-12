import type { PropertyCardDTOT } from '@rentuz/contracts';
import type {
  propertiesModel,
  propertyImagesModel,
  locationsModel,
} from '../../generated/prisma/models.js';

/** Row shape the card hydration queries return (properties + first image + region). */
export type CardRow = propertiesModel & {
  images: propertyImagesModel[];
  region: locationsModel | null;
};

export function publicStorageBaseUrl(): string {
  return (process.env.PUBLIC_STORAGE_BASE_URL ?? 'http://localhost:9000/rentuz-public').replace(
    /\/$/,
    '',
  );
}

/** §19 PropertyCard mapping — shared by search, favorites and public listings. */
export function toCardDTO(p: CardRow): PropertyCardDTOT {
  const base = publicStorageBaseUrl();
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    price: Number(p.price),
    priceUzs: Number(p.priceUzs),
    currency: p.currency,
    type: p.type,
    rooms: p.rooms,
    area: Number(p.area),
    address: p.address,
    mainImageUrl: p.mainImageUrl
      ? p.mainImageUrl.startsWith('http')
        ? p.mainImageUrl
        : `${base}/${p.mainImageUrl}`
      : null,
    regionName: p.region?.name ?? null,
    isVerified: p.isVerified,
    createdAt: p.createdAt,
  };
}
