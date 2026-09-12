# RentUZ MVP — Phase 5: Chat, Realtime, Attachments

> **Status (2026-09-12): COMPLETE.** All §1 tasks implemented; verification gate green
> (lint, typecheck, unit 104 [contracts 39 + api 65], integration 76 incl. the
> 2-instance Redis-adapter suite, build, E2E 9/9 incl. chat-flow, boot gate
> `/health` + `/ready` + socket.io handshake smoke). Deviations from the
> original plan recorded in `walkthroughs/phase-5-chat.md` and summarized below:
>
> 1. **Attachment key layout** (§1.1.4) — `chat/{conversationId}/{attachmentId}/800.webp`
>    (single 800w WebP variant). The doc's `chat/{conversationId}/{messageId}/`
>    is impossible: uploads happen before the message row exists. Send-time
>    validation enforces prefix containment + private-bucket HEAD existence →
>    400 `INVALID_ATTACHMENT_KEY`. Signed URLs mint on demand via
>    `GET /conversations/:id/attachments/url?key=` (600 s).
> 2. **Single shared `/chat?c={id}` page for tenant AND owner** — the
>    conversation API is participant-based; the doc's separate
>    `/owner/messages` (§1.3.15) is a recorded deviation. Owner sidebar
>    "Xabarlar" un-`soon`s and links to `/chat`.
> 3. **BottomNav grew 6 → 7 slots** ("Xabarlar" + unread badge,
>    `grid-cols-7`); Navbar got the same badge (60 s polling fallback —
>    RequestsBadge pattern).
> 4. **2-instance test = local integration suite**
>    (`realtime-two-instance.integration.test.ts`, `RENTUZ_REALTIME_SCALE=2`);
>    the 50 rps/20 s load test is an optional manual script, not a gate.
>    CI stays lint/typecheck/unit/build (unchanged this phase).
> 5. **One emit path** — `MessagesService.send`/`ConversationsService.getOrCreate`
>    emit on the in-app EventBus (`message.created`, `conversation.created`);
>    the gateway subscribes and does all `io.to(...)` fanout. REST and socket
>    sends deliver identically. Fanout: `message:new` → `conv:{id}` +
>    `user:{recipientId}` + `user:{senderId}` (multi-device + list/badge
>    updates); `conversation:new` → both participants' user rooms.
> 6. **Ticket payload `{ sub, jti }` + Redis `GETDEL`** (single-use), new
>    `PRESENCE_GRACE_MS` env (default 10000; 2000 in E2E webServer env).
> 7. **Suspended check at the service layer, DB-fresh** (§54): HTTP guards
>    don't cover WS events, and JWT status claims go stale (0_Phase trap 14).
> 8. **Cursor pagination via pure Prisma** — `orderBy createdAt desc, id desc`
>    + `cursor: { id: before }`, `skip: 1`, `take: limit+1` (hasMore); no raw
>    SQL. The 3-col index serves it.
> 9. **Global guards skip WS contexts** — APP_GUARDs (JwtAuth/Throttle/
>    Suspended/Role) are applied to gateway message handlers too; all four
>    return true for non-HTTP contexts (socket auth is the ticket handshake;
>    `message:send` has its own manual Redis rate limiter, 30/min §98).
> 10. **Gateway emits a `ready` event** after handleConnection's async work
>     lands (ticket consume + rooms) — clients wait for it before emitting;
>     plain `connect` fires too early and races `conversation:join`.
> 11. **Migration guard** — Prisma re-emitted a DROP of the raw PostGIS GIST
>     index `properties_location_gix` (invisible to the schema because
>     `location` is `Unsupported`). The migration file restores it by hand
>     (`CREATE INDEX IF NOT EXISTS`), documented in the walkthrough.
>
> Cross-cutting decisions live in `0_Phase.md`. Property/owner rules are in `2_Phase.md`. Conversation surfaces used here were stubbed in `1_Phase.md`. This phase lights up the conversation layer that connects tenants and owners, and the only realtime channel in the MVP.

## Goal
A tenant and an owner can exchange messages in a per-property conversation (one conversation per `(property, tenant, owner)` triple per §28). Messages persist first, then are emitted over Socket.IO. Typing indicators, read receipts, online presence, and image attachments (private bucket + signed URLs) all work. Vercel can't proxy WebSockets, so the browser connects directly to the API origin with a short-lived ticket; the BFF issues the ticket.

## Scope (spec coverage)
§27 (chat UX), §28 (Socket.IO events), §45 (chat API), §54 (only conversation participants can read/write), §94 (file security), §84 (event-driven notifications — used as the wiring pattern). The "Xabarlash" / "Contact owner" buttons wired in Phase 3/4 become functional.

## Out of scope this phase
- Push/email delivery (Phase 2 product)
- Group chat, voice/video (Phase 2+ product)
- End-to-end encryption (not in spec; S3 + signed URL is enough for MVP)
- Admin read of conversations (not in spec; only the audit log covers admin interest in messages)

---

## 1. Tasks (ordered, with paths)

### 1.1 REST — conversations
1. `apps/api/src/modules/conversations/conversations.service.ts`:
   - `getOrCreate({ propertyId, tenantId, ownerId })` — `findUnique` on the `(propertyId, tenantId, ownerId)` constraint, create if missing. Owner is taken from the property row (never trust the client). If `tenantId === ownerId` → 400 `CANNOT_CHAT_SELF`.
   - `listForUser(userId, { page, limit })` — conversations where the user is a participant, ordered by `lastMessageAt DESC NULLS LAST`. Returns: id, counterpart (the other participant's `id`, `name`, `avatar`), property (minimal: id, slug, mainImageUrl, title), lastMessagePreview, lastMessageAt, **unreadCount** = count of messages where `createdAt > participant.lastReadAt`.
   - `read(conversationId, userId)` — sets `conversationParticipants.lastReadAt = now()` for this user.
2. `apps/api/src/modules/messages/messages.service.ts`:
   - `list(conversationId, userId, { before, limit })` — cursor pagination by `(createdAt, id)`. Verifies participation.
   - `send({ conversationId, senderId, text, attachments })` — **persist then emit**: insert the message row, update `conversations.lastMessageAt` and `lastMessagePreview` (truncated to 200 chars), then return the message so the gateway can emit. The `attachments` payload shape is validated Zod-schema: `Array<{ key: string, mime: string, width: number, height: number, size: number }>`. Each attachment's URL is served on demand via `signedUrl(key, 600)`.
3. `apps/api/src/modules/conversations/conversations.controller.ts`:
   - `GET /conversations` — list for current user
   - `POST /conversations` — body `{ propertyId }`; user becomes the tenant, owner is loaded from the property. Returns the existing or new conversation.
   - `GET /conversations/:id/messages?before=&limit=` — paginated
   - `POST /conversations/:id/messages` — body `{ text?, attachments? }` (at least one required)
   - `POST /conversations/:id/read` — sets `lastReadAt`
4. `apps/api/src/modules/messages/messages.controller.ts` (or merge into conversations controller — see file structure):
   - `POST /messages/attachments` — multipart upload (≤5 files, ≤10 MB each, JPEG/PNG/WebP). Runs through the same `ImageService` from Phase 2, but uploads to the **private** bucket at `chat/{conversationId}/{messageId}/{variant}.webp`. Returns an array of metadata objects (no signed URL — those are minted at read time).

### 1.2 Realtime — gateway
5. `apps/api/src/modules/realtime/realtime.module.ts` — wires `@nestjs/websockets`, `@nestjs/platform-socket.io`, the `RedisIoAdapter` (a small wrapper around `@socket.io/redis-adapter`), and the gateway.
6. `apps/api/src/modules/realtime/redis-io.adapter.ts` — implements `IoAdapter`; shares the existing ioredis instance. Verifies the `RENTUZ_REALTIME_SCALE` env: if `> 1`, attach the adapter; otherwise a no-op (single instance runs without it).
7. `apps/api/src/modules/realtime/socket-ticket.service.ts`:
   - `issue(userId)` — signs a 60 s JWT with `{ sub: userId, scope: 'socket', jti }` using `SOCKET_TICKET_SECRET`. Returns `{ ticket, expiresIn: 60 }`.
   - `consume(ticket)` — verifies the JWT, looks up `jti` in Redis (`ticket:{jti}`); if present, deletes it (single-use) and returns the userId. If absent, throws 401 `INVALID_TICKET`.
8. `apps/api/src/modules/realtime/realtime.controller.ts`:
   - `POST /realtime/ticket` — `@UseGuards(JwtAuthGuard)`; returns `{ ticket, expiresIn: 60 }`. Frontend BFF is the only caller.
9. `apps/api/src/modules/realtime/realtime.gateway.ts` — `@WebSocketGateway({ cors: { origin: CORS_ORIGINS, credentials: true }, transports: ['websocket','polling'] })`:
   - `handleConnection(socket)`:
     1. Read `socket.handshake.auth.ticket`. If missing/invalid, `socket.disconnect(true)`.
     2. `ticketService.consume(ticket)` → userId. If fail, disconnect.
     3. `socket.data.userId = userId`. Mark user online in Redis (`presence:online:{userId}` with 30 s TTL — refreshed by heartbeat below).
     4. `socket.join(\`user:${userId}\`)` for direct emits. Join `presence:online` room for fanout.
     5. Emit `presence:update { userId, online: true }` to `presence:online` room.
   - Events (per §28):
     - `conversation:join` (client → server): payload `{ conversationId }`. Server checks participation; on success, `socket.join(\`conv:${conversationId}\`)`. Failure: `error` event with code `NOT_PARTICIPANT`.
     - `message:send` (client → server): payload `{ conversationId, text?, attachments? }`. Server calls `messagesService.send` (persist + update conversation). On success, `io.to(\`conv:${conversationId}\`).emit('message:new', message)`. On failure, `error` event with the same `code` from §91.
     - `message:read` (client → server): `{ conversationId }` → updates `lastReadAt`, emits `message:read` to `conv:${conversationId}` with `{ userId, conversationId, readAt }`.
     - `typing:start` / `typing:stop` (client → server): `{ conversationId }` → re-emit to `conv:${conversationId}` with `{ userId, conversationId }`. No persistence.
   - **Persistence order is enforced**: every `message:send` is a DB write first; the emit happens only after the write succeeds. This is the spec's explicit contract.
   - **Heartbeat**: `setInterval` (25 s) refreshes `presence:online:{userId}` and emits `presence:update` to subscribers.
   - **Disconnect**: clear the Redis presence key (with a small grace period so reconnects don't flicker), emit `presence:update { online: false }`.

### 1.3 Web — chat UX
10. `apps/web/src/app/(tenant)/chat/page.tsx` — split-pane on desktop (≥1024 px), full-screen on mobile, per §27:
    - **Left**: conversation list (last message preview, counterpart name + avatar, unread badge). Sort by `lastMessageAt DESC`.
    - **Right (desktop)** / **full (mobile)**: active conversation, message bubbles, input, attachment button, typing indicator, online dot, read receipts.
    - Mobile: tapping a conversation replaces the list with the chat; back button returns.
11. `apps/web/src/components/chat/ConversationList.tsx`, `ChatPane.tsx`, `MessageBubble.tsx`, `TypingIndicator.tsx`, `AttachmentPreview.tsx`, `Composer.tsx`, `OnlineDot.tsx`, `UnreadBadge.tsx`.
12. `apps/web/src/components/chat/socket-client.ts` — `io(NEXT_PUBLIC_SOCKET_URL, { transports: ['websocket'], auth: { ticket: '' } })`. On mount (or on reconnect), the client fetches a fresh ticket via BFF (`POST /api/v1/realtime/ticket`) and reconnects with it. On `connect_error`, retries with exponential backoff and a fresh ticket each time.
13. `apps/web/src/stores/chat.store.ts` — Zustand: `activeConversationId`, `typingByConversation: Map<conversationId, Set<userId>>`, `onlineUsers: Set<userId>`. Server-truth (messages, conversation list) lives in TanStack Query.
14. `apps/web/src/hooks/use-conversations.ts`, `use-messages.ts`, `use-socket.ts` — TanStack Query keys: `['conversations']`, `['messages', conversationId, beforeCursor]`. Socket events update the query cache directly (no refetch needed on new messages).
15. `apps/web/src/app/(owner)/owner/messages/page.tsx` — same chat UX, scoped to the owner's perspective. The list shows tenants (not the owner themselves). Reuse the components from the tenant side.
16. From a property's details page (Phase 3) and from a rental request (Phase 4), the "Xabarlash" / "Contact owner" button calls `POST /conversations { propertyId }` and navigates to `/chat?c={conversationId}`.
17. `apps/web/src/components/chat/AttachmentUpload.tsx` — drag-drop / paste; uses the same `ImageUploader` pattern as Phase 2, but calls the chat attachments endpoint. Thumbnails render with the signed URL fetched lazily (`GET /messages/attachments/:key/url` returns a 600 s signed URL on demand — minimal endpoint, added to `messages.controller.ts`).
18. `apps/web/src/app/(tenant)/layout.tsx` — add a "Xabarlar" nav entry; navbar shows a small badge with total unread count from `GET /conversations` (sum of `unreadCount`).

### 1.4 i18n keys
`chat.list.*`, `chat.composer.*`, `chat.placeholder`, `chat.attachment.label`, `chat.online`, `chat.read`, `chat.typing`, `chat.empty`. Other strings land with later phases.

### 1.5 API contracts
19. Zod in `packages/contracts`:
    ```ts
    export const CreateConversationInput = z.object({ propertyId: z.string().uuid() });
    export const SendMessageInput = z.object({
      text: z.string().min(1).max(2000).optional(),
      attachments: z.array(z.object({
        key: z.string().max(500), mime: z.string().max(100),
        width: z.number().int().positive(), height: z.number().int().positive(), size: z.number().int().positive(),
      })).max(5).optional(),
    }).refine(d => d.text || (d.attachments && d.attachments.length > 0), "Message must have text or attachments");
    export const AttachmentMeta = z.object({ key: z.string(), mime: z.string(), width: z.number(), height: z.number(), size: z.number() });
    export const MessageDTO = z.object({
      id: z.string().uuid(), conversationId: z.string().uuid(), senderId: z.string().uuid(),
      text: z.string(), attachments: z.array(AttachmentMeta), createdAt: z.coerce.date(),
    });
    export const ConversationDTO = z.object({
      id: z.string().uuid(),
      counterpart: z.object({ id: z.string().uuid(), name: z.string(), avatar: z.string().nullable() }),
      property: z.object({ id: z.string().uuid(), slug: z.string(), title: z.string(), mainImageUrl: z.string().nullable() }),
      lastMessageAt: z.coerce.date().nullable(),
      lastMessagePreview: z.string().nullable(),
      unreadCount: z.number().int().nonnegative(),
    });
    ```

---

## 2. Database changes
- **No new tables.** All needed tables are in `1_Phase.md`. New migration: `CREATE INDEX messages_conv_created_id_idx ON messages ("conversationId", "createdAt", id);` to support cursor pagination at the index level (avoids sort).

---

## 3. Tests

Unit:
- `messagesService.send` updates `lastMessageAt` and `lastMessagePreview` correctly
- `socketTicketService.consume` is single-use (second use throws)
- `unreadCount` is correct given `lastReadAt`

Integration (PostGIS + Redis + MinIO, 2 backend instances behind a test client to validate the Redis adapter):
- Tenant A creates a conversation with owner B (via `POST /conversations` with `propertyId`); idempotent — a second POST returns the same conversation
- Tenant A sends a message via REST → `message:new` is emitted to `conv:{id}` (verified by a second socket connected as owner B)
- Owner B sends a message via socket (`message:send`) → it persists first, then emits; message is in `GET /conversations/:id/messages`
- Non-participant user C attempts to `conversation:join` with a conversation they don't belong to → server emits `error` and does not join
- `message:read` updates `lastReadAt`; subsequent `unreadCount` reflects it
- Typing events are not persisted and do not change `lastMessageAt`
- Disconnect: presence key cleared after grace period; `presence:update { online: false }` is emitted to subscribers
- Suspended user cannot send → 403
- Image attachment: 5 images, ≤10 MB each, OK; 6th rejected; an SVG magic bytes rejected; private-bucket keys are NOT directly listable; signed URL works for 10 min then 401s after expiry
- Two-instance smoke: with the Redis adapter enabled, a message sent on instance 1 is delivered to a socket on instance 2

Security:
- Auth bypass: anonymous REST `POST /conversations` → 401
- Auth bypass: anonymous socket connect without ticket → disconnected
- Ticket reuse: a ticket used once cannot be used again
- CSRF: a non-allowed origin in the WebSocket handshake is rejected (CORS check)
- Attachment bypass: user A uploads an attachment to a conversation they're not in → 403

Web E2E (Playwright, two browser contexts = tenant + owner):
- Tenant logs in, opens details, clicks "Xabarlash" → routed to chat with owner
- Owner (separate context) sees the conversation appear in their list in real time
- Tenant types a message, sees "delivered" + "read" when owner opens the chat
- Owner replies; tenant sees the message appear with a "typing" indicator
- Disconnect owner's browser → tenant sees online dot go gray

---

## 4. Definition of Done
- All paths in §1 implemented; lint+typecheck+unit+integration+E2E green
- 2-instance smoke test green
- A slow-network simulation (Playwright `route` throttle) still delivers messages in correct order
- No message loss across 1000 messages sent in a load test (50 rps for 20 s) on 2 instances

## 5. Risks & escape hatches
- **Vercel → API origin CORS** — the API's CORS allowlist must include the production web origin *and* any preview deploy origins (we use a `*.vercel.app` wildcard or a dynamic check on the `Origin` header). Documented in Phase 8.
- **Socket.IO scaling without the adapter** — single-instance deployments are fine. The `RENTUZ_REALTIME_SCALE>1` env is the explicit switch. CI integration test covers the multi-instance path.
- **Ticket theft** — tickets are 60 s, single-use, scoped, and never logged. They carry no `iat`-based session; rotating them is just "issue a new one".
- **Backpressure on `presence:online` fanout** — a heartbeat in a room is fine for ≤10k concurrent users. Beyond that, use a per-user room and only emit to subscribers that explicitly asked (not done in MVP; documented in `8_Phase.md` §Scalability).
- **Chat attachments storage cost** — private bucket, 30-day lifecycle rule **must be added in Phase 8** (Supabase Storage has no auto-lifecycle, so the orphan cleanup job in Phase 2 is extended to chat paths too; a 30-day TTL is configurable via env). For MVP, this is documented and not enforced; the job will need a `CHAT_ATTACHMENT_TTL_DAYS` env from day one.
- **DB-then-emit ordering** — if the WS emit fails after a successful DB write, the client gets the message via a refetch (TanStack Query refetches on reconnect). Documented behavior; we don't try to make the emit durable.
