'use client';

import { create } from 'zustand';
import type { MessageDTOT } from '@rentuz/contracts';

/**
 * §27 chat UI state (Zustand — UI-only per 0_Phase.md; server truth lives in
 * TanStack Query). Maps are keyed by conversationId.
 */
interface ChatStore {
  /** The conversation the user currently has open (null → list view on mobile). */
  activeConversationId: string | null;
  setActiveConversation: (id: string | null) => void;
  /** Last seen (from-sender) messages per conversation — "typing…" placeholder rows. */
  draftByConversation: Record<string, string>;
  setDraft: (conversationId: string, text: string) => void;
  clearDraft: (conversationId: string) => void;
  /** typing:{userId} sets per conversation, driven by typing:update events. */
  typingByConversation: Record<string, Set<string>>;
  setTyping: (conversationId: string, userId: string, typing: boolean) => void;
  /** Online user ids, driven by presence:update. */
  onlineUsers: Set<string>;
  setOnline: (userId: string, online: boolean) => void;
  /** Counterpart lastReadAt per conversation — read receipts ("O'qilgan"). */
  counterpartLastReadAt: Record<string, string>;
  setLastReadAt: (conversationId: string, readAt: string) => void;
  /** Optimistic pending messages per conversation (cleared on ack/message:new). */
  pendingByConversation: Record<string, MessageDTOT[]>;
  addPending: (conversationId: string, message: MessageDTOT) => void;
  resolvePending: (conversationId: string, localId: string) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  activeConversationId: null,
  setActiveConversation: (id) => set({ activeConversationId: id }),

  draftByConversation: {},
  setDraft: (conversationId, text) =>
    set((s) => ({ draftByConversation: { ...s.draftByConversation, [conversationId]: text } })),
  clearDraft: (conversationId) =>
    set((s) => {
      const next = { ...s.draftByConversation };
      delete next[conversationId];
      return { draftByConversation: next };
    }),

  typingByConversation: {},
  setTyping: (conversationId, userId, typing) =>
    set((s) => {
      const current = s.typingByConversation[conversationId] ?? new Set<string>();
      const next = new Set(current);
      if (typing) next.add(userId);
      else next.delete(userId);
      return { typingByConversation: { ...s.typingByConversation, [conversationId]: next } };
    }),

  onlineUsers: new Set<string>(),
  setOnline: (userId, online) =>
    set((s) => {
      const next = new Set(s.onlineUsers);
      if (online) next.add(userId);
      else next.delete(userId);
      return { onlineUsers: next };
    }),

  counterpartLastReadAt: {},
  setLastReadAt: (conversationId, readAt) =>
    set((s) => {
      const prev = s.counterpartLastReadAt[conversationId];
      // Monotonic — an older readAt (out-of-order events) never wins.
      if (prev && new Date(prev) >= new Date(readAt)) return s;
      return { counterpartLastReadAt: { ...s.counterpartLastReadAt, [conversationId]: readAt } };
    }),

  pendingByConversation: {},
  addPending: (conversationId, message) =>
    set((s) => ({
      pendingByConversation: {
        ...s.pendingByConversation,
        [conversationId]: [...(s.pendingByConversation[conversationId] ?? []), message],
      },
    })),
  resolvePending: (conversationId, localId) =>
    set((s) => {
      const list = (s.pendingByConversation[conversationId] ?? []).filter((m) => m.id !== localId);
      return { pendingByConversation: { ...s.pendingByConversation, [conversationId]: list } };
    }),
}));
