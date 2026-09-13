import { z } from 'zod';
import { PropertyCardDTO, PropertyDetailDTO } from './properties.js';

/** §18 filter surface (3_Phase.md §1.8). `renovation` is deliberately absent:
 *  values are unnormalized free text today — revisit when they're an enum. */
export const PROPERTY_TYPES = [
  'APARTMENT',
  'HOUSE',
  'ROOM',
  'COMMERCIAL',
  'OFFICE',
  'LAND',
  'OTHER',
] as const;

export const FURNISHED_LEVELS = ['NONE', 'PARTIAL', 'FULL'] as const;

export const SEARCH_SORTS = ['newest', 'price_asc', 'price_desc', 'popular'] as const;

/** Query params arrive as strings — accept "true"/"false"/"1"/"0" plus real booleans. */
const queryBoolean = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

export const SearchInput = z
  .object({
    city: z.string().uuid().optional(),
    district: z.string().uuid().optional(),
    type: z.enum(PROPERTY_TYPES).optional(),
    minPrice: z.coerce.number().int().nonnegative().optional(),
    maxPrice: z.coerce.number().int().positive().optional(),
    rooms: z.coerce.number().int().min(0).max(20).optional(),
    bedrooms: z.coerce.number().int().min(0).max(20).optional(),
    bathrooms: z.coerce.number().int().min(0).max(20).optional(),
    minArea: z.coerce.number().positive().optional(),
    maxArea: z.coerce.number().positive().optional(),
    minFloor: z.coerce.number().int().min(-2).max(200).optional(),
    furnished: z.enum(FURNISHED_LEVELS).optional(),
    pets: queryBoolean.optional(),
    smoking: queryBoolean.optional(),
    verified: queryBoolean.optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    /** Meters. */
    radius: z.coerce.number().int().min(100).max(50000).optional(),
    sort: z.enum(SEARCH_SORTS).default('newest'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((d) => d.minPrice === undefined || d.maxPrice === undefined || d.minPrice <= d.maxPrice, {
    message: 'minPrice maxPricedan katta bo‘lmasligi kerak',
    path: ['minPrice'],
  })
  .refine((d) => d.minArea === undefined || d.maxArea === undefined || d.minArea <= d.maxArea, {
    message: 'minArea maxAreadan katta bo‘lmasligi kerak',
    path: ['minArea'],
  });
export type SearchInputT = z.infer<typeof SearchInput>;

/** Map viewport query (§93 lean payload). Only the filters the map UI exposes. */
export const MapInput = z.object({
  swLng: z.coerce.number().min(-180).max(180),
  swLat: z.coerce.number().min(-90).max(90),
  neLng: z.coerce.number().min(-180).max(180),
  neLat: z.coerce.number().min(-90).max(90),
  type: z.enum(PROPERTY_TYPES).optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().positive().optional(),
  verified: queryBoolean.optional(),
});
export type MapInputT = z.infer<typeof MapInput>;

export const MapMarkerDTO = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  price: z.coerce.number(),
  priceUzs: z.coerce.number(),
  currency: z.enum(['UZS', 'USD']),
  lat: z.number(),
  lng: z.number(),
  type: z.enum(PROPERTY_TYPES),
  mainImage: z.string().nullable(),
});
export type MapMarkerDTOT = z.infer<typeof MapMarkerDTO>;

export const MapResponse = z.object({
  markers: z.array(MapMarkerDTO),
  truncated: z.boolean(),
});
export type MapResponseT = z.infer<typeof MapResponse>;

export const CityDTO = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  count: z.number().int(),
});
export type CityDTOT = z.infer<typeof CityDTO>;

export const OwnerCardDTO = z.object({
  name: z.string(),
  avatar: z.string().nullable(),
  memberSince: z.coerce.date(),
  isPhoneVerified: z.boolean(),
});
export type OwnerCardDTOT = z.infer<typeof OwnerCardDTO>;

/** Public details (§20): full property minus owner-sensitive fields, plus the
 *  owner card and similar listings. Owner email/phone are structurally absent.
 *  `regionName` feeds the §69 SEO title format on the details page. */
export const PublicPropertyDetailDTO = PropertyDetailDTO.omit({ ownerId: true, status: true }).extend({
  ownerCard: OwnerCardDTO,
  regionName: z.string().nullable(),
  similar: z.array(PropertyCardDTO),
});
export type PublicPropertyDetailDTOT = z.infer<typeof PublicPropertyDetailDTO>;
