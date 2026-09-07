import { z } from 'zod';

/** Public minimal listing projection (§19 PropertyCard data shape). */
export const PropertyCardDTO = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  price: z.coerce.number(),
  priceUzs: z.coerce.number(),
  currency: z.enum(['UZS', 'USD']),
  type: z.enum(['APARTMENT', 'HOUSE', 'ROOM', 'COMMERCIAL', 'OFFICE', 'LAND', 'OTHER']),
  rooms: z.number().int(),
  area: z.coerce.number(),
  address: z.string(),
  mainImageUrl: z.string().nullable(),
  regionName: z.string().nullable(),
  isVerified: z.boolean(),
  createdAt: z.coerce.date(),
});
export type PropertyCardDTOT = z.infer<typeof PropertyCardDTO>;

export const PaginatedPropertyCards = z.object({
  data: z.array(PropertyCardDTO),
  meta: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

/** Owner-side property read with images + geo context. */
export const PropertyDetailDTO = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  type: z.enum(['APARTMENT', 'HOUSE', 'ROOM', 'COMMERCIAL', 'OFFICE', 'LAND', 'OTHER']),
  price: z.coerce.number(),
  priceUzs: z.coerce.number(),
  currency: z.enum(['UZS', 'USD']),
  period: z.string(),
  rooms: z.number().int(),
  bedrooms: z.number().int(),
  bathrooms: z.number().int(),
  area: z.coerce.number(),
  floor: z.number().int().nullable(),
  totalFloors: z.number().int().nullable(),
  renovation: z.string().nullable(),
  furnished: z.enum(['NONE', 'PARTIAL', 'FULL']),
  petsAllowed: z.boolean(),
  smokingAllowed: z.boolean(),
  address: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  regionId: z.string().uuid().nullable(),
  districtId: z.string().uuid().nullable(),
  amenities: z.array(z.string()),
  status: z.enum([
    'DRAFT',
    'PENDING_VERIFICATION',
    'ACTIVE',
    'PAUSED',
    'RENTED',
    'REJECTED',
    'DELETED',
  ]),
  isVerified: z.boolean(),
  views: z.number().int(),
  mainImageUrl: z.string().nullable(),
  images: z.array(
    z.object({
      id: z.string().uuid(),
      url: z.string(),
      thumbUrl: z.string().nullable(),
      width: z.number().int(),
      height: z.number().int(),
      ordering: z.number().int(),
    }),
  ),
  createdAt: z.coerce.date(),
});
export type PropertyDetailDTOT = z.infer<typeof PropertyDetailDTO>;

/** PATCH body — every field is optional; submit gate validates the full shape. */
export const PropertyUpdateInput = z
  .object({
    title: z.string().min(8).max(160).optional(),
    description: z.string().min(20).max(8000).optional(),
    type: z
      .enum(['APARTMENT', 'HOUSE', 'ROOM', 'COMMERCIAL', 'OFFICE', 'LAND', 'OTHER'])
      .optional(),
    price: z.coerce.number().positive().max(1e12).optional(),
    currency: z.enum(['UZS', 'USD']).optional(),
    rooms: z.coerce.number().int().min(0).max(20).optional(),
    bedrooms: z.coerce.number().int().min(0).max(20).optional(),
    bathrooms: z.coerce.number().int().min(0).max(20).optional(),
    area: z.coerce.number().positive().max(10000).optional(),
    floor: z.coerce.number().int().min(-2).max(200).nullable().optional(),
    totalFloors: z.coerce.number().int().min(1).max(200).nullable().optional(),
    renovation: z.string().max(40).nullable().optional(),
    furnished: z.enum(['NONE', 'PARTIAL', 'FULL']).optional(),
    petsAllowed: z.boolean().optional(),
    smokingAllowed: z.boolean().optional(),
    address: z.string().min(5).max(255).optional(),
    regionId: z.string().uuid().nullable().optional(),
    districtId: z.string().uuid().nullable().optional(),
    lng: z.coerce.number().min(-180).max(180).nullable().optional(),
    lat: z.coerce.number().min(-90).max(90).nullable().optional(),
    amenities: z.array(z.string().max(40)).max(40).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Kamida bitta maydon kerak' });
export type PropertyUpdateInputT = z.infer<typeof PropertyUpdateInput>;

/** Image DTOs. */
export const PropertyImageDTO = z.object({
  id: z.string().uuid(),
  url: z.string(),
  thumbUrl: z.string().nullable(),
  width: z.number().int(),
  height: z.number().int(),
  ordering: z.number().int(),
});
export type PropertyImageDTOT = z.infer<typeof PropertyImageDTO>;

export const ImageOrderInput = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(30),
});

/** Location DTO for the wizard pickers. */
export const LocationDTO = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  kind: z.string(),
  parentId: z.string().uuid().nullable(),
});
export type LocationDTOT = z.infer<typeof LocationDTO>;
