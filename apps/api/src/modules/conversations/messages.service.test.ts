import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { ConversationsService } from './conversations.service.js';
import type { EventBusService } from '../../common/services/event-bus.service.js';
import type { StorageService } from '../../common/services/storage.service.js';

const CONV = {
  id: 'conv-1',
  tenantId: 'tenant-1',
  ownerId: 'owner-1',
};

function makeService(overrides: {
  conversation?: Record<string, unknown> | null;
  senderStatus?: string;
  headOk?: boolean;
  prismaCreate?: ReturnType<typeof vi.fn>;
  prismaUpdate?: ReturnType<typeof vi.fn>;
} = {}) {
  const prisma = {
    conversations: {
      findUnique: vi.fn().mockResolvedValue(
        overrides.conversation === undefined ? CONV : overrides.conversation,
      ),
      update: overrides.prismaUpdate ?? vi.fn().mockResolvedValue({}),
    },
    users: {
      findUnique: vi.fn().mockResolvedValue({ status: overrides.senderStatus ?? 'ACTIVE' }),
    },
    messages: {
      create:
        overrides.prismaCreate ??
        vi.fn().mockImplementation(({ data }: { data: { id?: string; text: string; attachments: unknown[]; createdAt?: Date } }) => ({
          id: data.id ?? 'msg-1',
          conversationId: 'conv-1',
          senderId: 'tenant-1',
          text: data.text,
          attachments: data.attachments,
          createdAt: data.createdAt ?? new Date('2026-09-12T10:00:00Z'),
        })),
    },
  };
  const conversations = {
    requireParticipant: vi.fn().mockResolvedValue(undefined),
    isParticipant: vi.fn().mockResolvedValue(true),
  };
  const events = { emit: vi.fn() };
  const storage = {
    head: vi.fn().mockResolvedValue(overrides.headOk === false ? Promise.reject(new Error('404')) : {}),
  };
  const service = new MessagesService(
    prisma as unknown as PrismaService,
    conversations as unknown as ConversationsService,
    events as unknown as EventBusService,
    storage as unknown as StorageService,
  );
  return { service, prisma, events, conversations, storage };
}

describe('MessagesService.send', () => {
  it('persists, updates denormalized fields, then emits message.created', async () => {
    const { service, prisma, events } = makeService();
    const message = await service.send('conv-1', 'tenant-1', { text: 'Salom, kvartira bo‘shmi?' });

    expect(message.id).toBe('msg-1');
    expect(prisma.messages.create).toHaveBeenCalledWith({
      data: { conversationId: 'conv-1', senderId: 'tenant-1', text: 'Salom, kvartira bo‘shmi?', attachments: [] },
    });
    expect(prisma.conversations.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: {
        lastMessageAt: message.createdAt,
        lastMessagePreview: 'Salom, kvartira bo‘shmi?',
      },
    });
    // Emit happens exactly once with the recipient resolved from the row.
    expect(events.emit).toHaveBeenCalledTimes(1);
    const [event, payload] = (events.emit as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(event).toBe('message.created');
    expect(payload.recipientId).toBe('owner-1');
    expect(payload.senderId).toBe('tenant-1');
  });

  it('truncates lastMessagePreview to 200 chars', async () => {
    const { service, prisma } = makeService();
    const long = 'x'.repeat(350);
    await service.send('conv-1', 'tenant-1', { text: long });
    const updateCall = (prisma.conversations.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(updateCall[0].data.lastMessagePreview.length).toBe(200);
    expect(updateCall[0].data.lastMessagePreview).toBe('x'.repeat(200));
  });

  it('attachment-only messages store empty text (schema NOT NULL)', async () => {
    const { service, prisma } = makeService();
    const attachment = { key: 'chat/conv-1/a1/800.webp', mime: 'image/webp', width: 800, height: 600, size: 1000 };
    await service.send('conv-1', 'tenant-1', { attachments: [attachment] });
    expect(prisma.messages.create).toHaveBeenCalledWith({
      data: { conversationId: 'conv-1', senderId: 'tenant-1', text: '', attachments: [attachment] },
    });
  });

  it('rejects attachment keys outside the conversation prefix (INVALID_ATTACHMENT_KEY)', async () => {
    const { service } = makeService();
    const foreign = { key: 'chat/OTHER-CONV/a1/800.webp', mime: 'image/webp', width: 800, height: 600, size: 1000 };
    await expect(
      service.send('conv-1', 'tenant-1', { attachments: [foreign] }),
    ).rejects.toMatchObject({ status: 400 });
    try {
      await service.send('conv-1', 'tenant-1', { attachments: [foreign] });
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({ code: 'INVALID_ATTACHMENT_KEY' });
    }
  });

  it('rejects attachment keys that do not exist in the bucket (HEAD miss)', async () => {
    const { service } = makeService({ headOk: false });
    const missing = { key: 'chat/conv-1/ghost/800.webp', mime: 'image/webp', width: 800, height: 600, size: 1000 };
    await expect(service.send('conv-1', 'tenant-1', { attachments: [missing] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('non-participants get 403 NOT_PARTICIPANT', async () => {
    const { service } = makeService({ conversation: { ...CONV, tenantId: 'someone-else' } });
    await expect(service.send('conv-1', 'tenant-1', { text: 'hi' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('unknown conversation → 404', async () => {
    const { service } = makeService({ conversation: null });
    await expect(service.send('conv-1', 'tenant-1', { text: 'hi' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('suspended senders get 403 even with valid JWT claims (DB-fresh check)', async () => {
    const { service, events } = makeService({ senderStatus: 'SUSPENDED' });
    await expect(service.send('conv-1', 'tenant-1', { text: 'hi' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(events.emit).not.toHaveBeenCalled();
  });
});
