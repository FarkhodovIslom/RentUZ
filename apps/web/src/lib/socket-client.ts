'use client';

import { io, type Socket } from 'socket.io-client';
import { fetchCsrfToken } from './api';
import type { MessageDTOT } from '@rentuz/contracts';

/**
 * §28 browser socket — singleton against NEXT_PUBLIC_SOCKET_URL (the API
 * origin; Vercel cannot proxy WebSockets). Every connect attempt mints a
 * fresh 60 s single-use ticket via the BFF (cookie-authenticated) — the
 * async `auth` callback runs on each (re)connect, so socket.io's built-in
 * exponential backoff covers retries with a new ticket every time.
 */

type ServerEvents = {
  ready: (payload: { userId: string }) => void;
  'message:new': (message: MessageDTOT) => void;
  'conversation:new': (payload: { conversationId: string; propertyId: string; tenantId: string }) => void;
  'message:read': (payload: { userId: string; conversationId: string; readAt: string }) => void;
  'typing:update': (payload: { userId: string; conversationId: string; typing: boolean }) => void;
  'presence:update': (payload: { userId: string; online: boolean }) => void;
};

type ClientEvents = {
  'conversation:join': (
    payload: { conversationId: string },
    ack: (response: { ok: boolean; error?: { code: string } }) => void,
  ) => void;
  'message:send': (
    payload: { conversationId: string; text?: string; attachments?: unknown[] },
    ack: (response: { ok: boolean; message?: MessageDTOT; error?: { code: string; message?: string } }) => void,
  ) => void;
  'message:read': (
    payload: { conversationId: string },
    ack: (response: { ok: boolean; readAt?: string }) => void,
  ) => void;
  'typing:start': (
    payload: { conversationId: string },
    ack?: (response: unknown) => void,
  ) => void;
  'typing:stop': (
    payload: { conversationId: string },
    ack?: (response: unknown) => void,
  ) => void;
};

export type RentuzSocket = Socket<ServerEvents, ClientEvents>;

let socket: RentuzSocket | null = null;

/**
 * POST /realtime/ticket goes through the BFF like every mutating call and
 * carries the CSRF double-submit header (Phase 8, §53). The 60s single-use
 * JWT it returns authenticates the raw WS handshake to the API origin.
 */
async function fetchTicket(): Promise<string> {
  const csrfToken = await fetchCsrfToken().catch(() => '');
  const response = await fetch('/api/v1/realtime/ticket', {
    method: 'POST',
    credentials: 'same-origin',
    headers: csrfToken ? { 'x-rentuz-csrf': csrfToken } : undefined,
  });
  if (!response.ok) {
    throw new Error('ticket fetch failed');
  }
  const payload = (await response.json()) as { data?: { ticket?: string } };
  if (!payload.data?.ticket) {
    throw new Error('ticket missing');
  }
  return payload.data.ticket;
}

/** Returns the shared socket, connecting lazily on first use. */
export function getSocket(): RentuzSocket {
  if (socket) return socket;

  const origin = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000';
  socket = io(origin, {
    transports: ['websocket'],
    auth: (cb) => {
      fetchTicket()
        .then((ticket) => cb({ ticket }))
        .catch(() => cb(new Error('ticket unavailable')));
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });
  return socket;
}

/** Test/dev hook — drop the singleton (also disconnects). */
export function disposeSocket(): void {
  socket?.disconnect();
  socket = null;
}
