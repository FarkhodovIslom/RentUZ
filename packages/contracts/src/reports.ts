import { z } from 'zod';
import { CursorPaginationMeta } from './notifications.js';

/**
 * §47/§61 report contracts. The 7-reason set is fixed by spec (adding a
 * reason is an enum + i18n change). CRITICAL priority is reserved for admin
 * escalation — `create` never sets it.
 */
export const REPORT_REASONS = [
  'FAKE',
  'WRONG_PRICE',
  'WRONG_LOCATION',
  'SCAM',
  'DUPLICATE',
  'INAPPROPRIATE',
  'OTHER',
] as const;
export const ReportReason = z.enum(REPORT_REASONS);
export type ReportReasonT = z.infer<typeof ReportReason>;

export const REPORT_TARGETS = ['USER', 'PROPERTY', 'MESSAGE'] as const;
export const ReportTargetType = z.enum(REPORT_TARGETS);
export type ReportTargetTypeT = z.infer<typeof ReportTargetType>;

export const REPORT_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const ReportPrioritySchema = z.enum(REPORT_PRIORITIES);
export type ReportPriorityT = z.infer<typeof ReportPrioritySchema>;

export const REPORT_STATUSES = ['OPEN', 'REVIEWING', 'RESOLVED', 'REJECTED'] as const;
export const ReportStatusSchema = z.enum(REPORT_STATUSES);
export type ReportStatusT = z.infer<typeof ReportStatusSchema>;

/** Priority auto-derivation (§61): SCAM|FAKE|DUPLICATE→HIGH, WRONG_*→MEDIUM, else LOW. */
export function deriveReportPriority(reason: ReportReasonT): Exclude<ReportPriorityT, 'CRITICAL'> {
  if (reason === 'SCAM' || reason === 'FAKE' || reason === 'DUPLICATE') return 'HIGH';
  if (reason === 'WRONG_PRICE' || reason === 'WRONG_LOCATION') return 'MEDIUM';
  return 'LOW';
}

export const ReportEvidenceItem = z.object({
  kind: z.enum(['image', 'text']),
  ref: z.string().max(500),
});
export type ReportEvidenceItemT = z.infer<typeof ReportEvidenceItem>;

export const ReportCreateInput = z.object({
  targetType: ReportTargetType,
  targetId: z.string().uuid(),
  reason: ReportReason,
  description: z.string().max(1000).optional(),
  evidence: z.array(ReportEvidenceItem).max(5).optional(),
});
export type ReportCreateInputT = z.infer<typeof ReportCreateInput>;

/**
 * PATCH /admin/reports/:id semantics. `note` is optional for RESOLVED and
 * mandatory (≥10 chars) for REJECTED; ESCALATED flips priority to CRITICAL
 * and leaves status open. Side-effect booleans only apply to RESOLVED.
 */
export const ReportResolveBody = z
  .object({
    action: z.enum(['RESOLVED', 'REJECTED', 'ESCALATED']),
    note: z.string().max(500).optional(),
    suspendTarget: z.boolean().optional(),
    removeListing: z.boolean().optional(),
  })
  .superRefine((body, ctx) => {
    if (body.action === 'REJECTED' && (!body.note || body.note.trim().length < 10)) {
      ctx.addIssue({
        code: 'custom',
        path: ['note'],
        message: "Rad etishda izoh majburiy (kamida 10 belgi)",
      });
    }
  });
export type ReportResolveBodyT = z.infer<typeof ReportResolveBody>;

export const ReportDTO = z.object({
  id: z.string().uuid(),
  reporter: z.object({
    id: z.string().uuid(),
    name: z.string(),
    phone: z.string(),
  }),
  targetType: ReportTargetType,
  targetId: z.string().uuid(),
  /** Derived server-side: what the target row is (user/property/message summary). */
  target: z
    .object({
      kind: ReportTargetType,
      id: z.string().uuid(),
      label: z.string(),
      ownerId: z.string().uuid().nullable(),
    })
    .nullable(),
  reason: ReportReason,
  description: z.string().nullable(),
  evidence: z.array(ReportEvidenceItem),
  priority: ReportPrioritySchema,
  status: ReportStatusSchema,
  resolutionNote: z.string().nullable(),
  resolvedBy: z.string().uuid().nullable(),
  resolvedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});
export type ReportDTOT = z.infer<typeof ReportDTO>;

export const ReportListQuery = z.object({
  status: ReportStatusSchema.optional(),
  priority: ReportPrioritySchema.optional(),
  targetType: ReportTargetType.optional(),
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ReportListQueryT = z.infer<typeof ReportListQuery>;

export const ReportListResponse = z.object({
  data: z.array(ReportDTO),
  meta: CursorPaginationMeta,
});
export type ReportListResponseT = z.infer<typeof ReportListResponse>;

export const ReportCreatedDTO = z.object({
  id: z.string().uuid(),
  priority: ReportPrioritySchema,
  status: ReportStatusSchema,
});
export type ReportCreatedDTOT = z.infer<typeof ReportCreatedDTO>;
