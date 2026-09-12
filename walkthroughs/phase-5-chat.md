# Phase 5 — Chat, Realtime, Attachments (2026-09-12)

## Task

Implement `context/5_Phase.md` (§27–§28, §45, §54, §84, §94) on branch
`feature/phase-5-chat-realtime` (from `main`): per-property conversations,
Socket.IO realtime (single-use ticket auth, presence, typing, read receipts),
private-bucket image attachments with on-demand signed URLs, and the full chat
web surface. Also cleared the Phase 4 debt (`GET /properties/me` BigInt 500).

Authoritative plan: `context/5_Phase.md` + the planning session's design
(`.kilo/plans/1789163636696-phase-5-chat-realtime-attachments.md`), reconciled
against the codebase before implementation.

## Key findings during work

- **Global guards kill WS handlers** (0_Phase trap 16, new): APP_GUARDs apply to
  `@SubscribeMessage` handlers; `switchToHttp().getRequest()` is `undefined`
  there, so the JwtAuthGuard TypeError swallowed every ack — `emitWithAck`
  hung. All four guards now early-return for non-HTTP contexts.
- **`connect` races `handleConnection`** (trap 17, new): socket.io fires the
  client's `connect` before the async ticket consume/room joins finish; the
  gateway now emits a `ready` event clients wait for. Invalid tickets connect
  first, then get force-disconnected — tests assert the late disconnect.
- **`prisma migrate dev` re-drops the raw GIST index** (trap 18, new): the
  migration file re-creates `properties_location_gix` by hand.
- **engine.io `cors` doesn't gate native WS upgrades** (trap 19, new): the
  gateway adds `allowRequest` Origin checking.
- The docker stack's `minio-init` one-shot had never created the buckets on
  this machine after the colima outage — recreated `rentuz-public` +
  `rentuz-private` with `mc` (compose already encodes this; a fresh
  `docker compose up` on a clean volume does it automatically).

## Files changed

**Contracts** (`packages/contracts/src/`)
- `conversations.ts` (new): `CreateConversationInput`, `SendMessageInput`
  (text-XOR-attachments refine), `AttachmentMeta`, `MessageDTO`,
  `ConversationDTO`, list/cursor queries, `TicketResponse`, `SignedUrlResponse`
- `error-codes.ts`: `CONVERSATION_NOT_FOUND`, `NOT_PARTICIPANT`,
  `INVALID_TICKET`, `INVALID_ATTACHMENT_KEY`
- `conversations.test.ts` (new, 12 tests), `index.ts` export

**API** (`apps/api/src/`)
- Migration `20260912115350_messages_cursor_index` — 3-col messages index
  `(conversationId, createdAt, id)`; schema + hand-restored GIST index
- `modules/conversations/` (new): service (idempotent `getOrCreate` on the
  unique triple, P2002 re-find; `listForUser` with per-row unreadCount;
  `read`; `isParticipant`), `messages.service` (persist-then-emit,
  preview-200, DB-fresh suspended check, attachment prefix+HEAD validation,
  Prisma cursor pagination), controller (REST + `FilesInterceptor('files', 5)`
  private-bucket upload, `GET .../attachments/url` signed-URL mint)
- `modules/realtime/` (new): `socket-ticket.service` (`{ sub, jti }` +
  Redis GETDEL single-use), `redis-io.adapter` (scale-gated redis-adapter),
  `realtime.gateway` (ticket handshake + `ready`, conv/user/presence rooms,
  25 s heartbeat + 30 s TTL + grace, typing relay, manual 30/min limiter,
  EventBus fanout for `message:new`/`conversation:new`), `realtime.controller`
  (`POST /realtime/ticket`), module wiring
- Cross-cutting: `event-bus.service` (conversation events; `onRentalRequest`/
  `onConversation` split methods), `image.service` (`bucket: 'private'`
  option), `notifications.service` (`message.created` → NEW_MESSAGE),
  `token.service` (`{ sub, jti }` socket ticket), all four global guards
  (non-HTTP early return), `app.module` + `main.ts` (WS adapter + Swagger
  DTOs), `config/env.ts` + `.env.example` (`RENTUZ_REALTIME_SCALE`,
  `PRESENCE_GRACE_MS`)
- Debt fix: `properties.service.findOwn` — explicit select + `Number(priceUzs)`
  at the DTO boundary (BigInt 500 regression-tested)
- Tests: unit (`socket-ticket.service.test`, `messages.service.test` — 12 new),
  integration (`conversations-flow.integration.test.ts` — 16 cases;
  `realtime-two-instance.integration.test.ts` — 2 cases, scale=2 Redis adapter)

**Web** (`apps/web/src/`)
- `lib/socket-client.ts` (new): singleton, async `auth` cb mints a fresh BFF
  ticket per (re)connect
- `stores/chat.store.ts` (new, zustand): active conv, typing map, online set,
  counterpart lastReadAt, drafts/pending
- `hooks/` (new): `use-socket` (event → Query cache + store wiring,
  reconnect re-join + refetch durability net), `use-conversations`,
  `use-messages` (flat newest-first cache + `loadOlder` cursor),
  `use-attachment-url` (9-min stale)
- `components/chat/` (new): `ChatView`, `ChatPane`, `ConversationList`,
  `MessageBubble` (read receipts), `Composer` (Enter-sends, typing throttle),
  `AttachmentUpload`, `AttachmentPreview`, `OnlineDot`, `UnreadBadge`,
  `TypingIndicator`, `ChatBadge`, `StartChatButton`
- `app/(tenant)/chat/page.tsx` (new): session-gated server page → client
  ChatView (`?c=` deep link, split-pane ≥1024 px, mobile list↔chat)
- Nav: `Navbar` + `BottomNav` (6→7 slots) chat entries + unread badge;
  owner sidebar "Xabarlar" un-`soon` → `/chat`
- Wiring: property details (desktop aside + mobile CTA) and my-rentals
  active-card stubs → `StartChatButton`; i18n `chat.*` + `nav.chat` in
  `messages/uz.json`; `playwright.config.ts` webServer env
  `PRESENCE_GRACE_MS=2000`; `.env` (`NEXT_PUBLIC_SOCKET_URL` build-time)

**E2E** (`apps/web/e2e/`)
- `chat-flow.spec.ts` (new): two browser contexts — Xabarlash → `/chat?c=`,
  realtime both directions, "O'qilgan", typing indicator, attachment upload →
  signed-URL render on the other side, presence-offline after grace
- `fixtures/chat-200x200.png` (generated 200×200 test image)

## Verification (documented order, all green)

| Gate | Result |
| --- | --- |
| `pnpm lint` | ✓ 4/4 packages |
| `pnpm typecheck` | ✓ 5/5 packages |
| `pnpm test` (unit) | ✓ contracts 39 + api 65 = 104 |
| `pnpm --filter api test:integration` | ✓ 76/76 (16 conversations + 2 two-instance new) |
| `pnpm build` | ✓ contracts + api (SWC dist) + web (Next) |
| reseed (trap 15) | ✓ `pnpm --filter api db:seed` (120 properties) |
| `pnpm --filter web test:e2e` | ✓ 9/9 (8 prior + chat-flow) |
| Boot gate | ✓ `/health`, `/ready` (db+redis ok), socket.io handshake on :4000 |

## Merge with Phase 6/7 (2026-09-13)

Phase 6 (notifications/analytics) and Phase 7 (admin/moderation) landed on
`main` in parallel worktrees while Phase 5 was in review. Resolved conflicts:

- **EventBus**: adopted Phase 6's generic `on()/emit()` keyed off
  `BusEventPayloads`; Phase 5's `conversation.created` + `message.created`
  events joined the map. `MessageCreatedPayload` now carries BOTH the flat
  ids Phase 6's notification listener needs (`messageId`, `propertyId` —
  used for the idempotency key + enriched body) and the full `message` row
  the gateway fans out as `message:new`. Phase 5's own NEW_MESSAGE enqueue
  in `notifications.service` was dropped — Phase 6's
  `notification-listeners.ts` covers it (idempotent, actor name, property
  title).
- **Guards**: Phase 7 added a global `AdminGuard` — safe on WS (early-returns
  unless `@Roles('ADMIN')` is present); my four non-HTTP early-returns survive.
- **`AuditLogInterceptor`** (global): passes handlers without `@Audit`
  metadata untouched — gateway handlers unaffected.
- **Owner sidebar**: `/chat` (Phase 5) + un-`soon`ed analytics (Phase 6) kept.
- **Local env fix** (not code): `apps/api/.env` had `ADMIN_INITIAL_PASSWORD=`
  (empty string defeats the seed/spec `??` fallback → login 400 in Phase 7
  E2E) and lacked `ADMIN2_PHONE`. Set both + re-seeded.
- **Phase 5 test robustness** (post-merge): Phase 6 moved the integration env
  onto `apps/api/.env` (dotenv) — my `PRESENCE_GRACE_MS ??= '2000'` no longer
  overrode the 10000 default; changed to a forced assignment. Also fixed a
  latent timezone bug in Phase 6's rollup spec (UTC-only day anchoring dropped
  the oldest day when run 00:00–05:00 Tashkent; re-anchored to the Tashkent
  calendar) and the two-instance adapter teardown order (server close before
  pub/sub disconnect).

Full re-verification on the merged tree: lint ✓, typecheck ✓, unit 190 ✓
(contracts 76 + api 114), integration **103/103** ✓ (8 suites incl. Phase 6
notifications/analytics + Phase 7 admin), build ✓, reseed ✓, E2E **15/15** ✓
(12 specs incl. chat-flow + admin-moderation), boot gate ✓.

## Remaining limitations / debts

- **Emit is not durable** (5_Phase §5): a missed `message:new` is covered by
  TanStack refetch-on-reconnect (`use-socket` invalidates on `ready`).
- **Presence heuristics**: local socket-count + grace can briefly mis-report
  in exotic multi-device/multi-instance cases; the 30 s Redis TTL is the
  authority. Multi-instance presence flicker documented in the gateway.
- **unreadCount per-conv loop** (≤50 rows/page) — fine at MVP scale.
- **`NEW_MESSAGE` notifications** are enqueued for every message; the read
  endpoints + bell UI are Phase 6. Consider suppressing for active
  conversations in Phase 6.
- **Chat attachment TTL/orphan sweep** (`CHAT_ATTACHMENT_TTL_DAYS`) stays
  deferred to Phase 8 per 5_Phase §5.
- **Load test** (50 rps/20 s no-loss on 2 instances) — optional manual script,
  not implemented this phase (decision 4: CI unchanged).
- **`docker compose` MinIO buckets**: this machine needed a manual `mc mb`
  after the colima outage (one-shot init container only runs on first
  volume creation). Fresh environments are fine.
- `migrate reset` wipes locations (Phase 1 seed lives in git history at
  `c29ccda:apps/api/prisma/seed.ts`) — the Phase 2 seed expects them. If a
  reset is ever needed, re-run the Phase 1 seed first.
