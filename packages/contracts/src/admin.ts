import { z } from 'zod';
import { CursorPaginationMeta } from './notifications.js';
import { PropertyDetailDTO } from './properties.js';

/**
 * Phase 7 admin contracts (§47–§49, §54, §57–§61, §73). Admin lists use
 * cursor pagination (the documented §92 exception, same as notifications).
 * Input DTOs keep dates as YYYY-MM-DD strings — `z.coerce.date()` crashes
 * the Swagger converter (0_Phase.md §1 trap 12).
 */
export const RejectReason = z.string().min(10).max(500);
export type RejectReasonT = z.infer<typeof RejectReason>;

export const RejectBody = z.object({ reason: RejectReason });
export type RejectBodyT = z.infer<typeof RejectBody>;

export const RequestInfoBody = z.object({ message: RejectReason });
export type RequestInfoBodyT = z.infer<typeof RequestInfoBody>;

export const UserStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']);
export type UserStatusT = z.infer<typeof UserStatusSchema>;

export const SuspendBody = z.object({
  status: UserStatusSchema,
  reason: RejectReason.optional(),
});
export type SuspendBodyT = z.infer<typeof SuspendBody>;

export const SetPropertyStatusBody = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'REJECTED', 'DELETED']),
  reason: RejectReason.optional(),
});
export type SetPropertyStatusBodyT = z.infer<typeof SetPropertyStatusBody>;

/**
 * Runtime feature flags (§5 "Settings page mutations"): Redis override
 * `flags:runtime:*` + env default, 5 s in-process cache (FeatureFlagsService).
 * TTL names match Phase 6's NOTIFICATIONS_*_RETENTION_DAYS env vars (7_Phase.md
 * §1.9 originally said *_TTL_DAYS — reconciled to the shipped names).
 * The two dev-convenience booleans are hard-false in production regardless of
 * any override (env startup assertions stay authoritative at boot).
 */
export const FeatureFlagUpdate = z.object({
  AUTO_APPROVE_LISTINGS: z.boolean().optional(),
  AUTH_OTP_DEV_MODE: z.boolean().optional(),
  CHAT_ATTACHMENT_TTL_DAYS: z.number().int().min(1).max(365).optional(),
  NOTIFICATIONS_READ_RETENTION_DAYS: z.number().int().min(1).max(3650).optional(),
  NOTIFICATIONS_UNREAD_RETENTION_DAYS: z.number().int().min(1).max(3650).optional(),
});
export type FeatureFlagUpdateT = z.infer<typeof FeatureFlagUpdate>;

export const FeatureFlagDTO = z.object({
  name: z.string(),
  value: z.union([z.boolean(), z.number()]),
  source: z.enum(['override', 'env-default']),
  productionLocked: z.boolean(),
});
export type FeatureFlagDTOT = z.infer<typeof FeatureFlagDTO>;

// ─── §57 platform analytics ───

export const AdminAnalyticsQuery = z.object({
  range: z.enum(['7d', '30d', '90d']).default('30d'),
});
export type AdminAnalyticsQueryT = z.infer<typeof AdminAnalyticsQuery>;

export const AdminKpiDTO = z.object({
  totalUsers: z.number().int(),
  activeUsers: z.number().int(),
  totalProperties: z.number().int(),
  activeProperties: z.number().int(),
  pendingVerification: z.number().int(),
  openReports: z.number().int(),
  rentalRequestsInRange: z.number().int(),
  /** MVP placeholder — payments ship in Phase 2 of the product. */
  revenue: z.number(),
});
export type AdminKpiDTOT = z.infer<typeof AdminKpiDTO>;

export const AdminGrowthPoint = z.object({
  date: z.string(),
  newUsers: z.number().int(),
  newProperties: z.number().int(),
  requests: z.number().int(),
});
export type AdminGrowthPointT = z.infer<typeof AdminGrowthPoint>;

export const AdminAnalyticsResponse = z.object({
  kpis: AdminKpiDTO,
  series: z.array(AdminGrowthPoint),
});
export type AdminAnalyticsResponseT = z.infer<typeof AdminAnalyticsResponse>;

// ─── §58 admin users ───

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana YYYY-MM-DD formatida bo‘lishi kerak');

export const AdminUsersListQuery = z.object({
  search: z.string().max(120).optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
  status: UserStatusSchema.optional(),
  createdFrom: isoDay.optional(),
  createdTo: isoDay.optional(),
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminUsersListQueryT = z.infer<typeof AdminUsersListQuery>;

export const AdminUserDTO = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  avatar: z.string().nullable(),
  role: z.enum(['USER', 'ADMIN']),
  status: UserStatusSchema,
  isPhoneVerified: z.boolean(),
  canListProperties: z.boolean(),
  createdAt: z.coerce.date(),
  stats: z.object({
    properties: z.number().int(),
    activeProperties: z.number().int(),
    requestsAsTenant: z.number().int(),
    reportsAgainst: z.number().int(),
  }),
});
export type AdminUserDTOT = z.infer<typeof AdminUserDTO>;

export const AdminUserListResponse = z.object({
  data: z.array(AdminUserDTO),
  meta: CursorPaginationMeta,
});
export type AdminUserListResponseT = z.infer<typeof AdminUserListResponse>;

export const BulkSuspendBody = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(100),
  reason: RejectReason,
});
export type BulkSuspendBodyT = z.infer<typeof BulkSuspendBody>;

export const BulkSuspendResult = z.object({
  succeeded: z.array(z.object({ userId: z.string().uuid() })),
  failed: z.array(
    z.object({ userId: z.string().uuid(), reason: z.string() }),
  ),
  counts: z.object({ succeeded: z.number().int(), failed: z.number().int() }),
});
export type BulkSuspendResultT = z.infer<typeof BulkSuspendResult>;

// ─── §59 admin properties ───

export const AdminPropertiesListQuery = z.object({
  search: z.string().max(120).optional(),
  type: z
    .enum(['APARTMENT', 'HOUSE', 'ROOM', 'COMMERCIAL', 'OFFICE', 'LAND', 'OTHER'])
    .optional(),
  status: z
    .enum([
      'DRAFT',
      'PENDING_VERIFICATION',
      'ACTIVE',
      'PAUSED',
      'RENTED',
      'REJECTED',
      'DELETED',
    ])
    .optional(),
  verification: z.enum(['VERIFIED', 'UNVERIFIED']).optional(),
  ownerId: z.string().uuid().optional(),
  regionId: z.string().uuid().optional(),
  createdFrom: isoDay.optional(),
  createdTo: isoDay.optional(),
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminPropertiesListQueryT = z.infer<typeof AdminPropertiesListQuery>;

export const AdminPropertyRowDTO = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  type: z.enum(['APARTMENT', 'HOUSE', 'ROOM', 'COMMERCIAL', 'OFFICE', 'LAND', 'OTHER']),
  status: z.enum([
    'DRAFT',
    'PENDING_VERIFICATION',
    'ACTIVE',
    'PAUSED',
    'RENTED',
    'REJECTED',
    'DELETED',
  ]),
  pausedReason: z.string().nullable(),
  isVerified: z.boolean(),
  price: z.coerce.number(),
  currency: z.enum(['UZS', 'USD']),
  priceUzs: z.coerce.number(),
  mainImageUrl: z.string().nullable(),
  views: z.number().int(),
  createdAt: z.coerce.date(),
  owner: z.object({ id: z.string().uuid(), name: z.string(), phone: z.string() }),
});
export type AdminPropertyRowDTOT = z.infer<typeof AdminPropertyRowDTO>;

export const AdminPropertyListResponse = z.object({
  data: z.array(AdminPropertyRowDTO),
  meta: CursorPaginationMeta,
});
export type AdminPropertyListResponseT = z.infer<typeof AdminPropertyListResponse>;

export const AdminPropertyDetailDTO = PropertyDetailDTO.extend({
  pausedReason: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  submittedAt: z.coerce.date().nullable(),
  verifiedAt: z.coerce.date().nullable(),
  verifiedBy: z.string().uuid().nullable(),
  owner: z.object({
    id: z.string().uuid(),
    name: z.string(),
    phone: z.string(),
    status: UserStatusSchema,
  }),
});
export type AdminPropertyDetailDTOT = z.infer<typeof AdminPropertyDetailDTO>;

// ─── §60 verification queue ───

export const VerificationQueueQuery = z.object({
  status: z.enum(['PENDING', 'REVIEWING', 'APPROVED', 'REJECTED']).default('PENDING'),
  type: z
    .enum(['APARTMENT', 'HOUSE', 'ROOM', 'COMMERCIAL', 'OFFICE', 'LAND', 'OTHER'])
    .optional(),
  regionId: z.string().uuid().optional(),
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type VerificationQueueQueryT = z.infer<typeof VerificationQueueQuery>;

export const VerificationQueueItemDTO = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  type: z.enum(['APARTMENT', 'HOUSE', 'ROOM', 'COMMERCIAL', 'OFFICE', 'LAND', 'OTHER']),
  price: z.coerce.number(),
  currency: z.enum(['UZS', 'USD']),
  priceUzs: z.coerce.number(),
  mainImageUrl: z.string().nullable(),
  imageCount: z.number().int(),
  regionName: z.string().nullable(),
  submittedAt: z.coerce.date().nullable(),
  owner: z.object({ id: z.string().uuid(), name: z.string(), phone: z.string() }),
  claim: z
    .object({ adminId: z.string().uuid(), adminName: z.string(), at: z.coerce.date() })
    .nullable(),
});
export type VerificationQueueItemDTOT = z.infer<typeof VerificationQueueItemDTO>;

export const VerificationQueueResponse = z.object({
  data: z.array(VerificationQueueItemDTO),
  meta: CursorPaginationMeta,
});
export type VerificationQueueResponseT = z.infer<typeof VerificationQueueResponse>;

export const VerificationOwnerCardDTO = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string(),
  memberSince: z.coerce.date(),
  isPhoneVerified: z.boolean(),
  canListProperties: z.boolean(),
  /** Reports against the owner (USER target) or any of their properties. */
  priorViolations: z.number().int(),
  totalListings: z.number().int(),
});
export type VerificationOwnerCardDTOT = z.infer<typeof VerificationOwnerCardDTO>;

export const VerificationDetailDTO = PropertyDetailDTO.extend({
  pausedReason: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  submittedAt: z.coerce.date().nullable(),
  regionName: z.string().nullable(),
  districtName: z.string().nullable(),
  ownerCard: VerificationOwnerCardDTO,
  claim: z
    .object({ adminId: z.string().uuid(), adminName: z.string(), at: z.coerce.date() })
    .nullable(),
});
export type VerificationDetailDTOT = z.infer<typeof VerificationDetailDTO>;

export const VerificationActionDTO = z.object({
  id: z.string().uuid(),
  status: z.string(),
  isVerified: z.boolean(),
});
export type VerificationActionDTOT = z.infer<typeof VerificationActionDTO>;

// ─── §73 audit logs ───

export const AuditLogDTO = z.object({
  id: z.string().uuid(),
  admin: z.object({ id: z.string().uuid(), name: z.string(), phone: z.string() }),
  adminId: z.string().uuid(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().uuid(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.coerce.date(),
});
export type AuditLogDTOT = z.infer<typeof AuditLogDTO>;

export const AuditListQuery = z.object({
  action: z.string().max(60).optional(),
  adminId: z.string().uuid().optional(),
  targetType: z.string().max(30).optional(),
  targetId: z.string().uuid().optional(),
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AuditListQueryT = z.infer<typeof AuditListQuery>;

export const AuditListResponse = z.object({
  data: z.array(AuditLogDTO),
  meta: CursorPaginationMeta,
});
export type AuditListResponseT = z.infer<typeof AuditListResponse>;

// ─── admin requests (read-only) ───

export const AdminRequestsListQuery = z.object({
  status: z
    .enum(['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'COMPLETED'])
    .optional(),
  propertyId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  from: isoDay.optional(),
  to: isoDay.optional(),
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminRequestsListQueryT = z.infer<typeof AdminRequestsListQuery>;

export const AdminRequestRowDTO = z.object({
  id: z.string().uuid(),
  property: z.object({ id: z.string().uuid(), title: z.string(), slug: z.string() }),
  tenant: z.object({ id: z.string().uuid(), name: z.string(), phone: z.string() }),
  owner: z.object({ id: z.string().uuid(), name: z.string(), phone: z.string() }),
  message: z.string(),
  startDate: z.coerce.date(),
  durationMonths: z.number().int(),
  status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'COMPLETED']),
  priceUzsSnapshot: z.coerce.number(),
  decidedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});
export type AdminRequestRowDTOT = z.infer<typeof AdminRequestRowDTO>;

export const AdminRequestsListResponse = z.object({
  data: z.array(AdminRequestRowDTO),
  meta: CursorPaginationMeta,
});
export type AdminRequestsListResponseT = z.infer<typeof AdminRequestsListResponse>;
