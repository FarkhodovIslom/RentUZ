import { z } from 'zod';
import { PropertyCardDTO } from './properties.js';
import { paginationQuerySchema } from './pagination.js';

/**
 * §25/§44 rental request contracts. `startDate` is a date (not timestamp)
 * stored UTC; the create window is [today, today + 90 days] at UTC-day
 * granularity. Native Date math only — contracts stay dependency-free.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

export const RENTAL_REQUEST_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'COMPLETED',
] as const;

export const RequestStatus = z.enum(RENTAL_REQUEST_STATUSES);
export type RequestStatusT = z.infer<typeof RequestStatus>;

/** §26 "My Rentals" tabs — ACTIVE is a view over ACCEPTED rows (end in future). */
export const MyRentalsTab = z.enum(['ACTIVE', 'PENDING', 'COMPLETED', 'CANCELLED']);
export type MyRentalsTabT = z.infer<typeof MyRentalsTab>;

export const CreateRentalRequestInput = z.object({
  propertyId: z.string().uuid(),
  message: z.string().min(20).max(1000),
  // Wire format: ISO-8601 date ("2026-09-25", from <input type="date">) or
  // full datetime string. JSON Schema cannot express z.coerce.date() — the
  // @nestjs/swagger converter throws on Date — so this stays a string and
  // the service converts.
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/, 'Noto\'g\'ri sana formati')
    .refine((value) => {
      const time = new Date(value).getTime();
      if (!Number.isFinite(time)) return false;
      const today = Math.floor(Date.now() / DAY_MS) * DAY_MS; // UTC-day floor
      const max = today + 90 * DAY_MS;
      return time >= today && time <= max + DAY_MS - 1;
    }, 'Boshlanish sanasi 90 kundan oshmasligi va kelajakda bo\'lishi kerak'),
  durationMonths: z.number().int().min(1).max(36),
});
export type CreateRentalRequestInputT = z.infer<typeof CreateRentalRequestInput>;

/**
 * PATCH semantics — which transitions each role may perform is enforced in
 * the service (§54): owners ACCEPT/REJECT their properties' requests,
 * tenants CANCEL their own PENDING.
 */
export const UpdateRentalRequestInput = z.object({
  status: z.enum(['ACCEPTED', 'REJECTED', 'CANCELLED']),
  note: z.string().max(500).optional(),
});
export type UpdateRentalRequestInputT = z.infer<typeof UpdateRentalRequestInput>;

/** List query: ?status= + pagination. */
export const RentalRequestListQuery = paginationQuerySchema.extend({
  status: RequestStatus.optional(),
});
export type RentalRequestListQueryT = z.infer<typeof RentalRequestListQuery>;

export const RentalRequestDTO = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  propertyCard: PropertyCardDTO,
  message: z.string(),
  startDate: z.coerce.date(),
  durationMonths: z.number().int(),
  /** Derived on read (§25) — never stored. */
  endDate: z.coerce.date(),
  priceSnapshot: z.coerce.number(),
  currency: z.enum(['UZS', 'USD']),
  priceUzsSnapshot: z.coerce.number(),
  status: RequestStatus,
  decidedAt: z.coerce.date().nullable(),
  decisionNote: z.string().nullable(),
  createdAt: z.coerce.date(),
  /** Owner view only (§54: tenant identity is not exposed to tenants). */
  tenantCard: z
    .object({
      name: z.string(),
      avatarUrl: z.string().nullable(),
    })
    .nullable()
    .optional(),
});
export type RentalRequestDTOT = z.infer<typeof RentalRequestDTO>;

export const PaginatedRentalRequests = z.object({
  data: z.array(RentalRequestDTO),
  meta: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});
export type PaginatedRentalRequestsT = z.infer<typeof PaginatedRentalRequests>;
