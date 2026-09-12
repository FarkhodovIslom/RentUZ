import { z } from 'zod';
import { paginationQuerySchema } from './pagination.js';

/**
 * §27/§28/§45 chat contracts — one conversation per (property, tenant, owner)
 * triple. Attachment metadata travels without URLs: private-bucket keys are
 * minted into 600 s signed URLs on demand (`GET /conversations/:id/attachments/url`).
 */

export const CreateConversationInput = z.object({
  propertyId: z.string().uuid('Noto\'g\'ri e\'lon ID formati'),
});
export type CreateConversationInputT = z.infer<typeof CreateConversationInput>;

/** Private-bucket attachment descriptor (upload response / send payload). */
export const AttachmentMeta = z.object({
  key: z.string().min(1).max(500),
  mime: z.string().min(1).max(100),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  size: z.number().int().positive(),
});
export type AttachmentMetaT = z.infer<typeof AttachmentMeta>;

/** Text XOR attachments is not expressible in JSON Schema — the .refine is server-side only (§94). */
export const SendMessageInput = z
  .object({
    text: z.string().min(1).max(2000).optional(),
    attachments: z.array(AttachmentMeta).max(5).optional(),
  })
  .refine((d) => (d.text !== undefined && d.text.length > 0) || (d.attachments !== undefined && d.attachments.length > 0), {
    message: 'Xabarda matn yoki kamida bitta fayl bo\'lishi kerak',
  });
export type SendMessageInputT = z.infer<typeof SendMessageInput>;

/** Query for `GET /conversations` (§45) — plain pagination. */
export const ConversationListQuery = paginationQuerySchema;
export type ConversationListQueryT = z.infer<typeof ConversationListQuery>;

/** Cursor pagination over messages — `before` = message UUID, newest first. */
export const MessageListQuery = z.object({
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type MessageListQueryT = z.infer<typeof MessageListQuery>;

export const MessageDTO = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  senderId: z.string().uuid(),
  /** Empty string for attachment-only messages (schema: text NOT NULL). */
  text: z.string(),
  attachments: z.array(AttachmentMeta),
  createdAt: z.coerce.date(),
});
export type MessageDTOT = z.infer<typeof MessageDTO>;

export const ConversationDTO = z.object({
  id: z.string().uuid(),
  /** The other participant — participants are only tenant/owner (§28). */
  counterpart: z.object({
    id: z.string().uuid(),
    name: z.string(),
    avatar: z.string().nullable(),
  }),
  property: z.object({
    id: z.string().uuid(),
    slug: z.string(),
    title: z.string(),
    mainImageUrl: z.string().nullable(),
  }),
  lastMessageAt: z.coerce.date().nullable(),
  /** Truncated to 200 chars server-side; null before the first message. */
  lastMessagePreview: z.string().nullable(),
  unreadCount: z.number().int().nonnegative(),
});
export type ConversationDTOT = z.infer<typeof ConversationDTO>;

export const PaginatedConversations = z.object({
  data: z.array(ConversationDTO),
  meta: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});
export type PaginatedConversationsT = z.infer<typeof PaginatedConversations>;

/** Message page — newest-first array plus `hasMore` for upward pagination. */
export const MessagePage = z.object({
  data: z.array(MessageDTO),
  hasMore: z.boolean(),
});
export type MessagePageT = z.infer<typeof MessagePage>;

/** `POST /realtime/ticket` response (§28) — 60 s single-use. */
export const TicketResponse = z.object({
  ticket: z.string(),
  expiresIn: z.number().int().positive(),
});
export type TicketResponseT = z.infer<typeof TicketResponse>;

/** `GET /conversations/:id/attachments/url` response — signed for 600 s. */
export const SignedUrlResponse = z.object({
  url: z.string(),
  expiresIn: z.number().int().positive(),
});
export type SignedUrlResponseT = z.infer<typeof SignedUrlResponse>;
