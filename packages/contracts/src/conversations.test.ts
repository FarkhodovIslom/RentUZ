import { describe, expect, it } from 'vitest';
import {
  AttachmentMeta,
  ConversationDTO,
  ConversationListQuery,
  CreateConversationInput,
  MessageListQuery,
  MessagePage,
  SendMessageInput,
  SignedUrlResponse,
  TicketResponse,
} from './conversations.js';

const uuid = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

const attachment = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  key: `chat/${uuid}/a1b2c3d4/800.webp`,
  mime: 'image/webp',
  width: 800,
  height: 600,
  size: 45_678,
  ...overrides,
});

describe('CreateConversationInput', () => {
  it('accepts a property UUID', () => {
    expect(CreateConversationInput.parse({ propertyId: uuid })).toEqual({ propertyId: uuid });
  });

  it('rejects non-UUID ids', () => {
    expect(CreateConversationInput.safeParse({ propertyId: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('SendMessageInput', () => {
  it('accepts text-only', () => {
    const parsed = SendMessageInput.parse({ text: 'Salom!' });
    expect(parsed.text).toBe('Salom!');
  });

  it('accepts attachment-only', () => {
    const parsed = SendMessageInput.parse({ attachments: [attachment()] });
    expect(parsed.attachments?.length).toBe(1);
  });

  it('rejects empty payloads (no text, no attachments)', () => {
    expect(SendMessageInput.safeParse({}).success).toBe(false);
    expect(SendMessageInput.safeParse({ text: '' }).success).toBe(false);
    expect(SendMessageInput.safeParse({ attachments: [] }).success).toBe(false);
  });

  it('enforces text length and attachment count bounds', () => {
    expect(SendMessageInput.safeParse({ text: 'a'.repeat(2001) }).success).toBe(false);
    expect(SendMessageInput.safeParse({ attachments: Array.from({ length: 6 }, () => attachment()) }).success).toBe(false);
    expect(SendMessageInput.safeParse({ attachments: Array.from({ length: 5 }, () => attachment()) }).success).toBe(true);
  });
});

describe('AttachmentMeta', () => {
  it('requires positive dimensions and size', () => {
    expect(AttachmentMeta.safeParse(attachment({ width: 0 })).success).toBe(false);
    expect(AttachmentMeta.safeParse(attachment({ height: -1 })).success).toBe(false);
    expect(AttachmentMeta.safeParse(attachment({ size: 0 })).success).toBe(false);
    expect(AttachmentMeta.safeParse(attachment({ width: 1.5 })).success).toBe(false);
  });

  it('bounds key and mime lengths', () => {
    expect(AttachmentMeta.safeParse(attachment({ key: 'x'.repeat(501) })).success).toBe(false);
    expect(AttachmentMeta.safeParse(attachment({ mime: 'y'.repeat(101) })).success).toBe(false);
  });
});

describe('MessageListQuery / ConversationListQuery', () => {
  it('defaults limit to 30 for messages and validates the cursor', () => {
    const parsed = MessageListQuery.parse({});
    expect(parsed.limit).toBe(30);
    expect(MessageListQuery.parse({ before: uuid, limit: '50' })).toEqual({ before: uuid, limit: 50 });
    expect(MessageListQuery.safeParse({ before: 'nope' }).success).toBe(false);
    expect(MessageListQuery.safeParse({ limit: 101 }).success).toBe(false);
  });

  it('paginates conversations with the shared helper defaults', () => {
    const parsed = ConversationListQuery.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
    expect(ConversationListQuery.safeParse({ limit: 101 }).success).toBe(false);
  });
});

describe('output DTOs', () => {
  it('round-trips a ConversationDTO / MessagePage / ticket / signed-url shape', () => {
    const conv = {
      id: uuid,
      counterpart: { id: uuid, name: 'Owner', avatar: null },
      property: { id: uuid, slug: 'fixture-slug', title: 'Kvartira', mainImageUrl: null },
      lastMessageAt: new Date().toISOString(),
      lastMessagePreview: 'Salom',
      unreadCount: 2,
    };
    expect(ConversationDTO.parse(conv).unreadCount).toBe(2);
    expect(ConversationDTO.safeParse({ ...conv, unreadCount: -1 }).success).toBe(false);

    const msg = {
      id: uuid,
      conversationId: uuid,
      senderId: uuid,
      text: '',
      attachments: [attachment()],
      createdAt: new Date().toISOString(),
    };
    const page = MessagePage.parse({ data: [msg], hasMore: true });
    expect(page.data[0]!.createdAt).toBeInstanceOf(Date);
    expect(page.data[0]!.attachments[0]!.mime).toBe('image/webp');

    expect(TicketResponse.parse({ ticket: 'jwt', expiresIn: 60 }).expiresIn).toBe(60);
    expect(SignedUrlResponse.parse({ url: 'https://x/y', expiresIn: 600 }).url).toBe('https://x/y');
  });
});
