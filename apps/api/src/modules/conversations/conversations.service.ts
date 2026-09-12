import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EventBusService } from '../../common/services/event-bus.service.js';
import {
  buildPaginationMeta,
  type ConversationDTOT,
  type ConversationListQueryT,
  type CreateConversationInputT,
} from '@rentuz/contracts';
import { publicStorageBaseUrl } from '../properties/property-card.mapper.js';

/** conversations_propertyId_tenantId_ownerId_key (§28 one conversation per triple). */
const CONV_UNIQ_CONSTRAINT = 'conversations_propertyId_tenantId_ownerId_key';

type ConversationRow = Prisma.conversationsGetPayload<{
  include: {
    property: { select: { id: true; slug: true; title: true; mainImageUrl: true } };
    tenant: { select: { id: true; name: true; avatar: true } };
    owner: { select: { id: true; name: true; avatar: true } };
    participants: { select: { userId: true; lastReadAt: true } };
  };
}>;

const CONVERSATION_INCLUDE = {
  property: { select: { id: true, slug: true, title: true, mainImageUrl: true } },
  tenant: { select: { id: true, name: true, avatar: true } },
  owner: { select: { id: true, name: true, avatar: true } },
  participants: { select: { userId: true, lastReadAt: true } },
} satisfies Prisma.conversationsInclude;

/**
 * §45 conversation API — one conversation per (property, tenant, owner).
 * `getOrCreate` is idempotent (unique triple → P2002 race re-finds).
 */
@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
  ) {}

  async getOrCreate(userId: string, input: CreateConversationInputT): Promise<ConversationDTOT> {
    const property = await this.prisma.properties.findUnique({
      where: { id: input.propertyId },
      select: { id: true, ownerId: true, status: true },
    });
    if (!property || property.status === 'DELETED') throw new NotFoundException();

    // Owner is taken from the property row — never trusted from the client.
    if (property.ownerId === userId) {
      throw new BadRequestException({ code: 'CANNOT_CHAT_SELF' });
    }
    // Suspended users can't open conversations (§54; DB-fresh — JWT claims can
    // be stale per 0_Phase.md trap 14, and HTTP guards don't cover WS paths).
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (user?.status === 'SUSPENDED') {
      throw new ForbiddenException({ code: 'INSUFFICIENT_PERMISSIONS' });
    }

    let conversation: ConversationRow | null = await this.prisma.conversations.findUnique({
      where: {
        propertyId_tenantId_ownerId: {
          propertyId: property.id,
          tenantId: userId,
          ownerId: property.ownerId,
        },
      },
      include: CONVERSATION_INCLUDE,
    });
    let created = false;
    if (!conversation) {
      try {
        conversation = await this.prisma.conversations.create({
          data: {
            propertyId: property.id,
            tenantId: userId,
            ownerId: property.ownerId,
            participants: {
              create: [
                { userId, lastReadAt: new Date() },
                { userId: property.ownerId },
              ],
            },
          },
          include: CONVERSATION_INCLUDE,
        });
        created = true;
      } catch (error) {
        // Concurrent create on the same triple — the loser re-finds the winner.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          String((error.meta?.driverAdapterError as { cause?: { originalMessage?: string } })?.cause?.originalMessage).includes(CONV_UNIQ_CONSTRAINT)
        ) {
          conversation = await this.prisma.conversations.findUnique({
            where: {
              propertyId_tenantId_ownerId: {
                propertyId: property.id,
                tenantId: userId,
                ownerId: property.ownerId,
              },
            },
            include: CONVERSATION_INCLUDE,
          });
        } else {
          throw error;
        }
      }
    }
    if (!conversation) throw new ConflictException({ code: 'CONFLICT' });

    if (created) {
      this.events.emit('conversation.created', {
        conversationId: conversation.id,
        propertyId: property.id,
        tenantId: userId,
        ownerId: property.ownerId,
      });
    }
    return this.toDTO(conversation, userId);
  }

  /** §45 list — lastMessageAt DESC NULLS LAST, unread counted per row (§28). */
  async listForUser(
    userId: string,
    query: ConversationListQueryT,
  ): Promise<{ data: ConversationDTOT[]; meta: ReturnType<typeof buildPaginationMeta> }> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.conversations.findMany({
        where: { OR: [{ tenantId: userId }, { ownerId: userId }] },
        include: CONVERSATION_INCLUDE,
        orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.conversations.count({ where: { OR: [{ tenantId: userId }, { ownerId: userId }] } }),
    ]);

    // PostgreSQL `NULLS LAST` semantics via a stable secondary key: Prisma's
    // `desc` is NULLS FIRST, so swap — conversations without messages keep
    // their creation order at the end (§1.1 requirement).
    rows.sort((a, b) => {
      const aT = a.lastMessageAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      const bT = b.lastMessageAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      return bT - aT;
    });

    const data: ConversationDTOT[] = [];
    for (const row of rows) {
      data.push(await this.toDTOWithUnread(row, userId));
    }
    return { data, meta: buildPaginationMeta(query.page, query.limit, total) };
  }

  /** §28 read receipts — advances the caller's lastReadAt to now. */
  async read(conversationId: string, userId: string): Promise<{ conversationId: string; readAt: Date }> {
    await this.requireParticipant(conversationId, userId);
    const readAt = new Date();
    await this.prisma.conversationParticipants.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: readAt },
    });
    return { conversationId, readAt };
  }

  /** Shared participant gate (gateway + controllers). */
  async isParticipant(conversationId: string, userId: string): Promise<boolean> {
    const participant = await this.prisma.conversationParticipants.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { userId: true },
    });
    return participant !== null;
  }

  async requireParticipant(conversationId: string, userId: string): Promise<void> {
    if (!(await this.isParticipant(conversationId, userId))) {
      throw new ForbiddenException({ code: 'NOT_PARTICIPANT' });
    }
  }

  /** Conversation row + counterpart for the given viewer (throws 404/403). */
  async loadForParticipant(conversationId: string, userId: string): Promise<ConversationRow> {
    const conversation = await this.prisma.conversations.findUnique({
      where: { id: conversationId },
      include: CONVERSATION_INCLUDE,
    });
    if (!conversation) throw new NotFoundException();
    if (conversation.tenantId !== userId && conversation.ownerId !== userId) {
      throw new ForbiddenException({ code: 'NOT_PARTICIPANT' });
    }
    return conversation;
  }

  // -------------------------------------------------------------- internals

  private toDTO(row: ConversationRow, viewerId: string): ConversationDTOT {
    const counterpart = row.tenantId === viewerId ? row.owner : row.tenant;
    return {
      id: row.id,
      counterpart: {
        id: counterpart.id,
        name: counterpart.name,
        avatar: counterpart.avatar,
      },
      property: this.propertyCard(row),
      lastMessageAt: row.lastMessageAt,
      lastMessagePreview: row.lastMessagePreview,
      unreadCount: 0, // hydrated by toDTOWithUnread for list views
    };
  }

  private async toDTOWithUnread(row: ConversationRow, viewerId: string): Promise<ConversationDTOT> {
    const dto = this.toDTO(row, viewerId);
    const lastReadAt = row.participants.find((p) => p.userId === viewerId)?.lastReadAt ?? null;
    dto.unreadCount = await this.prisma.messages.count({
      where: {
        conversationId: row.id,
        senderId: { not: viewerId },
        ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
      },
    });
    return dto;
  }

  private propertyCard(row: ConversationRow): ConversationDTOT['property'] {
    const base = publicStorageBaseUrl();
    // propertyId is nullable in the schema, but every conversation is created
    // from a property row — the guard exists purely for the type surface.
    const property = row.property;
    return {
      id: property!.id,
      slug: property!.slug,
      title: property!.title,
      mainImageUrl: property!.mainImageUrl
        ? property!.mainImageUrl.startsWith('http')
          ? property!.mainImageUrl
          : `${base}/${property!.mainImageUrl}`
        : null,
    };
  }
}
