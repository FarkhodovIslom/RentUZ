import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EventBusService } from '../../common/services/event-bus.service.js';
import {
  type AttachmentMetaT,
  type MessageDTOT,
  type MessageListQueryT,
  type MessagePageT,
  type SendMessageInputT,
} from '@rentuz/contracts';
import { ConversationsService } from './conversations.service.js';
import { StorageService } from '../../common/services/storage.service.js';

type MessageRow = Prisma.messagesGetPayload<Record<string, never>>;

/**
 * §28/§45 message flow — persist first, then emit (the spec's explicit
 * contract: a failed write never produces a phantom emit; a failed emit is
 * covered client-side by the TanStack refetch-on-reconnect).
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly events: EventBusService,
    private readonly storage: StorageService,
  ) {}

  /** Newest-first cursor pagination by (createdAt, id) — the 3-col index serves it. */
  async list(
    conversationId: string,
    userId: string,
    query: MessageListQueryT,
  ): Promise<MessagePageT> {
    await this.conversations.requireParticipant(conversationId, userId);
    // Prisma keyset: `cursor` positions at the `before` row in the (createdAt,
    // id) desc order; `skip: 1` starts strictly after it — no manual filter.
    const rows = await this.prisma.messages.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(query.before ? { cursor: { id: query.before }, skip: 1 } : {}),
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return { data: page.map((r) => this.toDTO(r)), hasMore };
  }

  /** Persist → update conversation denormalized fields → emit (§28 ordering). */
  async send(
    conversationId: string,
    senderId: string,
    input: SendMessageInputT,
  ): Promise<MessageDTOT> {
    const conversation = await this.prisma.conversations.findUnique({
      where: { id: conversationId },
      select: { id: true, tenantId: true, ownerId: true },
    });
    if (!conversation) throw new NotFoundException();
    if (conversation.tenantId !== senderId && conversation.ownerId !== senderId) {
      throw new ForbiddenException({ code: 'NOT_PARTICIPANT' });
    }
    // Suspended users are blocked at the service layer, DB-fresh (§54 — WS
    // events bypass the HTTP SuspendedGuard and JWT status claims go stale).
    const sender = await this.prisma.users.findUnique({
      where: { id: senderId },
      select: { status: true },
    });
    if (sender?.status === 'SUSPENDED') {
      throw new ForbiddenException({ code: 'INSUFFICIENT_PERMISSIONS' });
    }
    if (input.attachments) {
      await this.validateAttachments(conversationId, input.attachments);
    }

    // Attachment-only messages carry empty text (schema: text NOT NULL).
    const text = input.text ?? '';
    const attachments = input.attachments ?? [];

    const message = await this.prisma.messages.create({
      data: {
        conversationId,
        senderId,
        text,
        attachments,
      },
    });
    await this.prisma.conversations.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: message.createdAt,
        lastMessagePreview: text.slice(0, 200),
      },
    });

    const recipientId = conversation.tenantId === senderId ? conversation.ownerId : conversation.tenantId;
    this.events.emit('message.created', {
      message: {
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        text: message.text,
        attachments: message.attachments as Array<{
          key: string;
          mime: string;
          width: number;
          height: number;
          size: number;
        }>,
        createdAt: message.createdAt,
      },
      conversationId,
      recipientId,
      senderId,
    });
    return this.toDTO(message);
  }

  /**
   * §94 attachment containment: keys must live under this conversation's
   * prefix AND exist in the private bucket (HEAD). A key from another
   * conversation is an attempt to attach foreign uploads.
   */
  private async validateAttachments(conversationId: string, attachments: AttachmentMetaT[]): Promise<void> {
    for (const attachment of attachments) {
      if (!attachment.key.startsWith(`chat/${conversationId}/`)) {
        throw new BadRequestException({ code: 'INVALID_ATTACHMENT_KEY' });
      }
      const exists = await this.storage
        .head(attachment.key, 'private')
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        throw new BadRequestException({ code: 'INVALID_ATTACHMENT_KEY' });
      }
    }
  }

  private toDTO(row: MessageRow): MessageDTOT {
    return {
      id: row.id,
      conversationId: row.conversationId,
      senderId: row.senderId,
      text: row.text,
      attachments: row.attachments as Array<{
        key: string;
        mime: string;
        width: number;
        height: number;
        size: number;
      }>,
      createdAt: row.createdAt,
    };
  }
}
