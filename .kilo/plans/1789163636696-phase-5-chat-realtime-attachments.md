# Phase 5 — Chat, Realtime, Attachments (implementation plan)

Branch: `feature/phase-5-chat-realtime` (from `feature/phase-4-rental-requests`)
Authoritative docs: `context/5_Phase.md` (§27–§28, §45, §54, §84, §94), `context/0_Phase.md` (traps 3/8/12–15, §2 auth/WS decisions), `walkthroughs/phase-4-rental-requests.md` (debts).

## Resolved decisions (this planning session)

1. **Attachment flow** (doc's `chat/{convId}/{messageId}/` key is impossible — upload precedes message creation): endpoint `POST /conversations/:id/attachments`, key `chat/{conversationId}/{attachmentId}/800.webp` (attachmentId = fresh UUID per file; single 800w WebP variant via `ImageService` with `widths: [800]`, `bucket: 'private'` — new option). Send-time validation: each key must start with `chat/{conversationId}/` **and** exist (HEAD) → else 400 `INVALID_ATTACHMENT_KEY`. Signed URLs minted on demand: `GET /conversations/:id/attachments/url?key=…` → `{ url, expiresIn: 600 }`.
2. **Single shared `/chat?c={id}` page for all roles** (tenant + owner — conversation API is participant-based). Doc §1.3.15's separate `/owner/messages` is a recorded deviation; owner sidebar "Xabarlar" un-`soon`s and links to `/chat`.
3. **BottomNav 7th slot** "Xabarlar" with unread badge (`grid-cols-7`); Navbar gets the same badge.
4. **DoD scope**: 2-instance integration test (Redis adapter) is a CI test; the 50rps/20s load test ships as an **optional manual script** (`apps/api/scripts/load-test-chat.mjs`), not a CI gate.
5. **One emit path**: `MessagesService.send` and `ConversationsService.getOrCreate` emit on the EventBus (`message.created`, `conversation.created` — bus union widened); the realtime module subscribes and does all `io.to(...)` fanout. REST and socket sends get identical delivery. Fanout: `message:new` → `conv:{id}` + `user:{recipientId}` + `user:{senderId}` (multi-device + list/badge updates without joining the conv room); `conversation:new` → `user:{ownerId}` (owner list appears in real time, per E2E requirement).
6. **Socket ticket**: extend existing `TokenService.signSocketTicket/verifySocketTicket` (`common/services/token.service.ts`, aud `socket`, 60 s) to carry `{ sub, jti }`. `SocketTicketService`: issue → `jti=randomUUID`, `SET ticket:{jti} {userId} EX 60`, sign; consume → verify + `GETDEL ticket:{jti}` → nil = 401 `INVALID_TICKET` (single-use).
7. **Presence**: Redis `presence:online:{userId}` EX 30, 25 s heartbeat per connection, clients join `presence:online` room; disconnect → per-instance socket-count map, when 0 → wait `PRESENCE_GRACE_MS` (new env, default 10000; small in tests/E2E) → key absent ⇒ emit `presence:update { online: false }`.
8. **Suspended check at the service layer, DB-fresh** (0_Phase §54; guards don't apply to WS): `MessagesService.send` + `ConversationsService.getOrCreate` read the user's status from DB → 403 `INSUFFICIENT_PERMISSIONS`. (Robust regardless of trap 14's stale-JWT note.)
9. **Module layout**: `modules/conversations/` (conversations.service, messages.service, conversations.controller — REST incl. nested messages/attachments/read) + `modules/realtime/` (gateway, redis-io.adapter, socket-ticket.service, realtime.controller). Doc §1.1.4's merge option is used.
10. **Cursor pagination** via Prisma: `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]`, `cursor: { id: before }`, `skip: 1`, `take: limit+1` (hasMore). `before` = message UUID. No raw SQL needed; the new 3-col index serves it.
11. **Socket rate limit**: manual `RateLimiterRedis` in the gateway for `message:send` (30/min per user, §98); REST endpoints get `@Throttle`.

## Contracts (`packages/contracts/src/`)

- New `conversations.ts` per doc §1.5 (Uzbek refine messages; `XxxInput`/`XxxDTO` + `T`-suffix types; output DTOs may use `z.coerce.date()` — trap 12 only bans pipe inputs):
  - `CreateConversationInput { propertyId: uuid }`
  - `SendMessageInput { text? 1..2000, attachments? ≤5 of AttachmentMeta }` refine (text or ≥1 attachment)
  - `AttachmentMeta { key ≤500, mime ≤100, width/height/size int positive }`
  - `MessageDTO { id, conversationId, senderId, text, attachments[], createdAt }`
  - `ConversationDTO { id, counterpart { id, name, avatar }, property { id, slug, title, mainImageUrl }, lastMessageAt?, lastMessagePreview?, unreadCount }`
  - `ConversationListQuery = paginationQuerySchema` (page/limit); `MessageListQuery { before?: uuid, limit 1..100 default 30 }`; `TicketResponse { ticket, expiresIn }`; `SignedUrlResponse { url, expiresIn }`
- `error-codes.ts` domain codes: `CANNOT_CHAT_SELF`, `NOT_PARTICIPANT`, `INVALID_TICKET`, `INVALID_ATTACHMENT_KEY`, `CONVERSATION_NOT_FOUND`
- Export from `index.ts`; unit tests `conversations.test.ts`.

## API — `apps/api/src/`

### Migration
- `schema.prisma`: `messages` index `@@index([conversationId, createdAt])` → `@@index([conversationId, createdAt, id])`; `prisma migrate dev --name messages_cursor_index` (drops the 2-col, creates the 3-col; direct URL per trap 4). No geo types — no `search_path` needed.

### `modules/conversations/`
- `conversations.service.ts`:
  - `getOrCreate({ propertyId, userId })` — load property (404 `PROPERTY_NOT_FOUND`); owner from the property row; `userId === ownerId` → 400 `CANNOT_CHAT_SELF`; status check (decision 8); `findUnique` on `(propertyId, tenantId, ownerId)`; create in a transaction (conversation + 2 `conversationParticipants`); P2002 race → re-find and return existing (idempotent). Emit `conversation.created`.
  - `listForUser(userId, { page, limit })` — participant convs, `lastMessageAt desc nulls last`; hydrate counterpart + minimal property (mapper pattern); `unreadCount` = messages with `senderId != userId AND createdAt > lastReadAt` (per-conv count loop, page ≤20 — MVP-acceptable).
  - `read(conversationId, userId)` — participant check → set `lastReadAt = now()`.
  - `isParticipant(conversationId, userId)` — shared helper for gateway + controllers.
- `messages.service.ts`:
  - `list(conversationId, userId, { before, limit })` — participation check (403 `NOT_PARTICIPANT`); decision 10 pagination.
  - `send({ conversationId, senderId, text, attachments })` — participation + DB-fresh status; attachment containment + HEAD existence (decision 1); create message + update `lastMessageAt`/`lastMessagePreview` (slice 200); emit `message.created` (payload: message + `recipientId` + participant ids). Persist-then-emit order is the contract (doc §1.2.9).
- `conversations.controller.ts` (all `@ApiTags`, JWT via global guard; `@Throttle` messages 30/min per user §98):
  - `GET /conversations` · `POST /conversations` · `GET /conversations/:id/messages` · `POST /conversations/:id/messages` · `POST /conversations/:id/read`
  - `POST /conversations/:id/attachments` — `FilesInterceptor('files', 5)` + per-file `MaxFileSizeValidator` 10 MB; participation 403; each buffer → `ImageService.processAndStore(buffer, { bucket: 'private', keyPrefix: `chat/${conversationId}`, widths: [800] })`; returns `AttachmentMeta[]` (mime `image/webp`, original width/height, processed size).
  - `GET /conversations/:id/attachments/url?key=` — participation + prefix check → `storage.signedUrl(key, 600)`.

### `modules/realtime/`
- `redis-io.adapter.ts` — extends `IoAdapter`; if `RENTUZ_REALTIME_SCALE > 1`: two **new** ioredis connections from `REDIS_URL` (shared client unusable — BullMQ precedent) + `createAdapter` from `@socket.io/redis-adapter`; else no-op.
- `socket-ticket.service.ts` — decision 6. Unit-test single-use.
- `realtime.controller.ts` — `POST /realtime/ticket` → `{ ticket, expiresIn: 60 }` (light `@Throttle` 30/min).
- `realtime.gateway.ts` — `@WebSocketGateway({ cors: { origin: corsOrigins, credentials: true }, transports: ['websocket','polling'] })`:
  - `handleConnection`: consume ticket (fail → `disconnect(true)`); `socket.data.userId`; join `user:{id}` + `presence:online`; SET presence key EX 30; 25 s heartbeat interval; emit `presence:update { online: true }`.
  - `conversation:join` → participation → `socket.join('conv:{id}')` else `error { code: 'NOT_PARTICIPANT' }`.
  - `message:send` → Zod parse (`SendMessageInput`, manual — StandardSchema pipe is HTTP-only) → manual rate limiter → `messagesService.send` → ack returns the message (fanout happens via the EventBus subscriber).
  - `message:read` → `conversationsService.read` → emit `message:read { userId, conversationId, readAt }` to `conv:{id}`.
  - `typing:start|stop` → participant check → re-emit to `conv:{id}` with `{ userId, conversationId }`. No persistence.
  - `disconnect` — decision 7.
  - EventBus subscriptions (module init): `message.created` → decision 5 fanout; `conversation.created` → `conversation:new` (ConversationDTO shape) to `user:{ownerId}`.
- `main.ts`: `app.useWebSocketAdapter(new RedisIoAdapter(app))`. Register both modules in `app.module.ts`. Register new DTO schemas in the Swagger `z.toJSONSchema` workaround (existing pattern).

### Cross-cutting
- `common/services/event-bus.service.ts` — widen with `CONVERSATION_EVENTS = ['conversation.created', 'message.created']` + payload types (typed overloads on `on`/`emit`).
- `common/services/image.service.ts` — add `bucket?: 'public' | 'private'` option (default public → `putPrivate` + private keys).
- `modules/notifications/notifications.service.ts` — map `message.created` → `NEW_MESSAGE` to `recipientId`.
- `config/env.ts` + `.env.example`: `RENTUZ_REALTIME_SCALE` (default 1), `PRESENCE_GRACE_MS` (default 10000).
- Deps (exact): api `@nestjs/websockets@12.0.1 @nestjs/platform-socket.io@12.0.1 socket.io@4.8.3 @socket.io/redis-adapter@8.3.0`; web `socket.io-client@4.8.3 zustand@5.0.15`.

## Web — `apps/web/src/`

- `lib/socket-client.ts` — singleton `io(NEXT_PUBLIC_SOCKET_URL, { transports: ['websocket'], auth: (cb) => fetchTicket().then(t => cb({ ticket: t.ticket }), cb) })` — async auth callback mints a fresh ticket on **every** connect attempt; socket.io's built-in exponential backoff covers retries (doc §1.3.12).
- `hooks/use-socket.ts` (connect when session exists; provider mounted in `components/providers` so the nav badge is realtime), `use-conversations.ts` (`['conversations']`), `use-messages.ts` (`useInfiniteQuery ['messages', conversationId]`, pageParam = `before`), `use-attachment-url.ts` (`['attachment-url', key]`, staleTime 9 min).
- `stores/chat.store.ts` (zustand): `activeConversationId`, `typingByConversation`, `onlineUsers`, `counterpartLastReadAt` map.
- Socket → cache: `message:new` upserts message + updates `['conversations']` (unread++ unless active conv → auto `POST read`); `conversation:new` upserts list; `message:read` updates read-state map; `presence:update` updates `onlineUsers`.
- `components/chat/`: `ConversationList`, `ChatPane`, `MessageBubble` (own right / counterpart left; "O'qilgan" on last own message when `counterpartLastReadAt >= createdAt`), `Composer` (typing:start throttled on input, stop on blur/empty/3 s), `TypingIndicator`, `AttachmentPreview`, `AttachmentUpload` (drag-drop/paste → `POST /conversations/:id/attachments`), `OnlineDot`, `UnreadBadge`.
- Page `app/(tenant)/chat/page.tsx` — client component; `?c=` param; split-pane ≥1024 px, mobile list↔chat swap with back; `(tenant)` layout requires only a session (owners pass — verified).
- Nav: `Navbar` + `BottomNav` "Xabarlar" (badge = Σ unreadCount; 60 s polling fallback like `RequestsBadge`), `grid-cols-6` → `grid-cols-7`.
- Wire buttons: property details aside + mobile CTA "Xabarlash", and my-rentals "Bog'lanish" → client `StartChatButton` (POST `/conversations { propertyId }` → `router.push('/chat?c=' + id)`); 401 → login redirect (RentalRequestModal precedent); if `session.id === ownerId` (exposed in property DTO) → hidden/replaced with "Sizning e'loningiz".
- i18n: `chat.list.*`, `chat.composer.*`, `chat.placeholder`, `chat.attachment.label`, `chat.online`, `chat.read`, `chat.typing`, `chat.empty`, `nav.chat` in `messages/uz.json`.
- Env: `NEXT_PUBLIC_SOCKET_URL=http://localhost:4000` must be present at **build** time (baked) — add to `apps/web/.env`, CI build env, and the Playwright `webServer` env; API webServer env there also gets `PRESENCE_GRACE_MS=2000` for snappy offline-dot E2E.

## E2E (`apps/web/e2e/`)

- `chat-flow.spec.ts` (two browser contexts = tenant + owner; owner provisions property via `provisionProperty()`):
  tenant clicks "Xabarlash" → `/chat?c=`; owner's list shows the conversation (realtime `expect.poll`); tenant message arrives to owner; owner opens → tenant sees "O'qilgan"; owner replies (typing indicator visible to tenant); tenant uploads an image (`setInputFiles` with generated PNG) → owner sees it render via signed URL; owner page closes → tenant's online dot grays after grace.
- Reuse auth/registration helpers; assert against `:4000` socket traffic implicitly through UI.

## API tests

- Unit: `messages.service` (preview truncation 200, lastMessageAt update, attachment prefix/HEAD validation, suspended 403); `socket-ticket.service` (single-use via mocked `GETDEL`); event-bus widened types; contracts tests.
- Integration (`apps/api/test/`), boot must mirror `main.ts` **incl. the WS adapter** (trap 13 extension):
  - `conversations-flow.integration.test.ts` — doc §3 matrix: idempotent create; REST send → owner's socket receives `message:new`; socket `message:send` → persists then emits; non-participant `conversation:join` → `error NOT_PARTICIPANT`; read/unread; typing not persisted; presence offline after grace (small `PRESENCE_GRACE_MS`); suspended 403; `CANNOT_CHAT_SELF`; anonymous REST 401; anonymous socket disconnected; ticket reuse rejected; bad-`Origin` handshake rejected; attachments 5 OK / 6th 400 / SVG magic bytes 400 / non-participant upload 403 / signed URL 200 + expiry (direct `signedUrl(key, 1)` + sleep → 403).
  - `realtime-two-instance.integration.test.ts` — two apps, shared Redis, `RENTUZ_REALTIME_SCALE=2`; message via instance 1 → socket on instance 2 receives it.
- Optional manual: `apps/api/scripts/load-test-chat.mjs` (50 rps / 20 s, ~1000 messages, 2 instances, no-loss check).

## Verification order (AGENTS.md)

lint → typecheck → `pnpm test` → `pnpm --filter api test:integration` → `pnpm build` → **reseed** (trap 15: integration truncates users cascade) → `pnpm --filter web test:e2e` → boot gate (`/health`, `/ready`) → manual socket smoke (ticket → connect → send → receive → read → presence).

## Docs updates (with the PR)

- `context/5_Phase.md` header: deviations (decisions 1–4, 9, 11; `PRESENCE_GRACE_MS`; ticket payload `{ sub, jti }`; load test manual).
- `context/0_Phase.md`: record any new traps found (candidates: WS gateway ignores the `/api/v1` global prefix — client connects at socket.io default path; SWC + gateway decorators; socket.io async-auth-cb ticket flow) + confirm §1 pins installed.
- `walkthroughs/phase-5-chat.md` (dated, files/verification/limitations).

## Risks / accepted limitations

- Emit is not durable (doc §5): missed `message:new` is covered by TanStack refetch-on-reconnect.
- Presence heuristics (local count + grace) can briefly mis-report in exotic multi-device/multi-instance cases; the 30 s TTL is the ultimate authority.
- `unreadCount` per-conv loop (≤20 counts/list page) — fine at MVP scale.
- Chat-attachment TTL/orphan-job extension (`CHAT_ATTACHMENT_TTL_DAYS`) stays deferred to Phase 8 per doc §5.
- `NEW_MESSAGE` notifications are always enqueued (read endpoints + bell are Phase 6).
- Load test is manual-only (decision 4).

## Task order

1. Branch `feature/phase-5-chat-realtime`; fix pre-existing debt: `GET /properties/me` BigInt 500 (`Number()` pass at the DTO boundary, Phase 4 walkthrough recommendation) + regression test.
2. Deps + env additions (decision 11 list; `RENTUZ_REALTIME_SCALE`, `PRESENCE_GRACE_MS`, `NEXT_PUBLIC_SOCKET_URL` build-time).
3. Migration (3-col messages index).
4. Contracts + error codes + tests.
5. EventBus widening; ImageService private-bucket option.
6. Conversations module (service, messages service, controller + attachments).
7. Realtime module (ticket, adapter, gateway, controller); `app.module` + `main.ts` wiring; notifications mapping.
8. Unit + integration tests (incl. two-instance).
9. Web: socket client, hooks, store, chat components, `/chat` page, nav + badge, `StartChatButton` wiring, i18n, Playwright env.
10. E2E `chat-flow.spec.ts`; optional load script.
11. Full verification gate (order above) + docs + walkthrough.
